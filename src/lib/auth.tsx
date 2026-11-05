import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALLOWED_DOMAINS, CLIENT_ID, DEMO } from './config';
import { connectAuth } from './api';

type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
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

/*
 * Google's sign-in token lasts one hour. To keep members signed in:
 *  - the token and profile are kept in localStorage, so closing the tab doesn't sign anyone out;
 *  - before the token runs out (and whenever the tab comes back into view), Google is asked for a
 *    fresh one with auto sign-in, which needs no click for a returning member;
 *  - a request that comes back "expired" renews once and retries before giving up.
 * Members are only shown the sign-in page if Google can't renew, or after they sign out on purpose.
 */
const TOKEN_KEY = 'fblaprep.token';
const PROFILE_KEY = 'fblaprep.profile';
const OUT_KEY = 'fblaprep.signedOut';
const RENEW_EARLY_MS = 5 * 60_000;
const RENEW_WAIT_MS = 12_000;

function decode(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json) as Record<string, unknown>;
  } catch { return null; }
}
function expiry(jwt: string): number { return Number(decode(jwt)?.exp || 0) * 1000; }
function profileFrom(claims: Record<string, unknown>): Profile {
  const email = String(claims.email || '').toLowerCase();
  return {
    email,
    name: String(claims.name || email.split('@')[0]),
    givenName: String(claims.given_name || claims.name || '').split(' ')[0],
    picture: String(claims.picture || ''),
  };
}
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const token = useRef<string | null>(null);
  const exp = useRef(0);
  const initialized = useRef(false);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const renewing = useRef<Promise<string | null> | null>(null);
  const [tokenTick, setTokenTick] = useState(0);

  const settle = useCallback((t: string | null) => {
    const w = waiters.current;
    waiters.current = [];
    renewing.current = null;
    w.forEach((fn) => fn(t));
  }, []);

  const clear = useCallback((message = '') => {
    token.current = null; exp.current = 0;
    store.del(TOKEN_KEY); store.del(PROFILE_KEY);
    setProfile(null); setStatus('signedOut'); setError(message);
    settle(null);
  }, [settle]);

  /** Takes a Google credential: checks the school domain, saves it, and signs the member in. */
  const accept = useCallback((jwt: string): boolean => {
    const claims = decode(jwt);
    if (!claims) { setError('Google sign-in didn’t work. Try again.'); return false; }
    const p = profileFrom(claims);
    const domain = p.email.split('@')[1] || '';
    if (!ALLOWED_DOMAINS.includes(domain)) {
      window.google?.accounts?.id?.disableAutoSelect();
      clear(`Sign in with your school Google account (@${ALLOWED_DOMAINS[0]}), not ${p.email}.`);
      return false;
    }
    token.current = jwt; exp.current = expiry(jwt);
    store.set(TOKEN_KEY, jwt); store.set(PROFILE_KEY, JSON.stringify(p)); store.del(OUT_KEY);
    setProfile(p); setStatus('signedIn'); setError('');
    setTokenTick((n) => n + 1);
    settle(jwt);
    return true;
  }, [clear, settle]);

  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  const init = useCallback(async () => {
    await loadGis();
    if (initialized.current) return;
    initialized.current = true;
    window.google!.accounts!.id!.initialize({
      client_id: CLIENT_ID,
      callback: (r: { credential?: string }) => { if (r.credential) acceptRef.current(r.credential); },
      auto_select: true,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: 'signin',
    });
  }, []);

  /** Asks Google for a fresh token without a click. Resolves to null if it can't. */
  const renew = useCallback((): Promise<string | null> => {
    if (DEMO) return Promise.resolve('demo');
    if (renewing.current) return renewing.current;
    renewing.current = new Promise<string | null>((resolve) => {
      waiters.current.push(resolve);
      init()
        .then(() => { try { window.google?.accounts?.id?.prompt(); } catch { settle(null); } })
        .catch(() => settle(null));
      setTimeout(() => { if (renewing.current) settle(null); }, RENEW_WAIT_MS);
    });
    return renewing.current;
  }, [init, settle]);

  /** A usable token for the next request: the saved one, or a renewed one. */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (DEMO) return 'demo';
    if (token.current && exp.current - Date.now() > 60_000) return token.current;
    return renew();
  }, [renew]);

  useEffect(() => {
    connectAuth({
      getToken,
      renew,
      onExpired: () => clear('Your sign-in ran out. Sign in again. Your progress is saved.'),
    });
  }, [getToken, renew, clear]);

  // On load: use the saved token, or renew it quietly if this member was signed in before.
  useEffect(() => {
    if (DEMO) { setStatus('signedOut'); return; }
    if (!CLIENT_ID) { setStatus('signedOut'); setError('Google sign-in isn’t set up yet. Officers: add VITE_GOOGLE_CLIENT_ID.'); return; }
    const saved = store.get(TOKEN_KEY);
    let known: Profile | null = null;
    try { known = JSON.parse(store.get(PROFILE_KEY) || 'null') as Profile | null; } catch { known = null; }
    if (saved && expiry(saved) - Date.now() > 60_000) {
      accept(saved);
    } else if (known && !store.get(OUT_KEY)) {
      // Show the site right away. The first request waits for Google to renew the token.
      setProfile(known); setStatus('signedIn');
      void renew();
    } else {
      setStatus('signedOut');
    }
    init().catch(() => setError('Google sign-in couldn’t load. Check your connection, or ask IT whether accounts.google.com is blocked.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Renew a few minutes before the hour is up, and when the tab comes back into view.
  useEffect(() => {
    if (DEMO || status !== 'signedIn' || !token.current) return;
    const t = setTimeout(() => { void renew(); }, Math.max(0, exp.current - Date.now() - RENEW_EARLY_MS));
    const onShow = () => {
      if (document.visibilityState === 'visible' && exp.current - Date.now() < RENEW_EARLY_MS) void renew();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); };
  }, [status, tokenTick, renew]);

  const renderButton = useCallback((el: HTMLElement | null) => {
    if (!el || DEMO || !CLIENT_ID) return;
    init().then(() => {
      const id = window.google?.accounts?.id;
      if (!id) return;
      el.innerHTML = '';
      id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', width: 260 });
    }).catch(() => {});
  }, [init]);

  const signOut = useCallback(() => {
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* ignore */ }
    store.set(OUT_KEY, '1');
    clear();
  }, [clear]);

  const demoSignIn = useCallback(() => {
    token.current = 'demo'; exp.current = Date.now() + 365 * 86_400_000;
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
