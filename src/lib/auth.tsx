import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALLOWED_DOMAINS, CLIENT_ID, DEMO } from './config';
import { connectAuth } from './api';

type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
};
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

export type Profile = { email: string; name: string; givenName: string; picture: string };
type Status = 'loading' | 'signedOut' | 'signedIn';
type AuthState = {
  status: Status;
  profile: Profile | null;
  error: string;
  signOut: () => void;
  renderButton: (el: HTMLElement | null) => void;
  demoSignIn: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORE = 'fblaprep.idToken';

function decode(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json) as Record<string, unknown>;
  } catch { return null; }
}
function profileFrom(claims: Record<string, unknown>): Profile {
  const email = String(claims.email || '').toLowerCase();
  return {
    email,
    name: String(claims.name || email.split('@')[0]),
    givenName: String(claims.given_name || claims.name || '').split(' ')[0],
    picture: String(claims.picture || ''),
  };
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('gis')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const tokenRef = useRef<string | null>(null);
  const ready = useRef(false);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setToken(null); setProfile(null); setStatus('signedOut');
    try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
  }, []);

  const accept = useCallback((jwt: string) => {
    const claims = decode(jwt);
    if (!claims) { setError('Google sign-in didn’t work. Try again.'); return; }
    const p = profileFrom(claims);
    const domain = p.email.split('@')[1] || '';
    if (!ALLOWED_DOMAINS.includes(domain)) {
      setError(`Sign in with your school Google account (@${ALLOWED_DOMAINS[0]}), not ${p.email}.`);
      window.google?.accounts?.id?.disableAutoSelect();
      clear();
      return;
    }
    setError('');
    tokenRef.current = jwt;
    setToken(jwt); setProfile(p); setStatus('signedIn');
    try { sessionStorage.setItem(STORE, jwt); } catch { /* ignore */ }
  }, [clear]);

  useEffect(() => {
    connectAuth(() => tokenRef.current, () => {
      clear();
      setError('Your sign-in expired. Sign in again. Your answers are saved.');
    });
  }, [clear]);

  // Restore a still-valid token after a reload.
  useEffect(() => {
    if (DEMO) { setStatus('signedOut'); return; }
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(STORE); } catch { /* ignore */ }
    const claims = saved ? decode(saved) : null;
    if (saved && claims && Number(claims.exp) * 1000 > Date.now() + 60_000) accept(saved);
    else setStatus('signedOut');
    if (!CLIENT_ID) { setError('Google sign-in isn’t set up yet. Officers: add VITE_GOOGLE_CLIENT_ID.'); return; }
    loadGis().then(() => {
      if (ready.current) return;
      ready.current = true;
      window.google!.accounts!.id!.initialize({
        client_id: CLIENT_ID,
        callback: (r: { credential?: string }) => { if (r.credential) accept(r.credential); },
        auto_select: true,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
    }).catch(() => setError('Google sign-in couldn’t load. Check your connection, or ask IT whether accounts.google.com is blocked.'));
  }, [accept]);

  // Sign out when the Google token expires (they last about an hour), and try a silent refresh first.
  useEffect(() => {
    if (!token || DEMO) return;
    const claims = decode(token);
    const ms = Number(claims?.exp) * 1000 - Date.now() - 45_000;
    const t = setTimeout(() => {
      try { window.google?.accounts?.id?.prompt(); } catch { /* ignore */ }
      setTimeout(() => { if (tokenRef.current === token) { clear(); setError('Your sign-in expired. Sign in again to keep going.'); } }, 30_000);
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [token, clear]);

  const renderButton = useCallback((el: HTMLElement | null) => {
    if (!el || DEMO || !CLIENT_ID) return;
    loadGis().then(() => {
      const id = window.google?.accounts?.id;
      if (!id) return;
      el.innerHTML = '';
      id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', width: 280 });
    }).catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    window.google?.accounts?.id?.disableAutoSelect();
    clear();
  }, [clear]);

  const demoSignIn = useCallback(() => {
    tokenRef.current = 'demo';
    setToken('demo');
    setProfile({ email: 'demo@sbstudents.org', name: 'Demo Member', givenName: 'Demo', picture: '' });
    setStatus('signedIn');
  }, []);

  const value = useMemo<AuthState>(() => ({ status, profile, error, signOut, renderButton, demoSignIn }), [status, profile, error, signOut, renderButton, demoSignIn]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
