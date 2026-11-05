import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useDataMaybe } from '../lib/data';
import { DEMO, mainSite } from '../lib/config';

/* ---------- Small shared pieces ---------- */

const base = 'cut-sm inline-flex items-center justify-center gap-2 whitespace-nowrap transition active:translate-y-px disabled:pointer-events-none disabled:opacity-45';
export const btn = {
  gold: `${base} h-11 bg-gold px-5 font-semiwide text-[15px] font-extrabold text-navy-950 hover:bg-gold-300`,
  navy: `${base} h-11 bg-navy-900 px-5 font-semiwide text-[15px] font-bold text-white hover:bg-navy-700`,
  quiet: `${base} h-10 bg-navy-100 px-4 text-[14px] font-bold text-navy-900 hover:bg-navy-200`,
  white: `${base} h-10 bg-white px-4 text-[14px] font-bold text-navy-900 hover:bg-navy-50`,
  ghost: 'inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-2 transition hover:text-navy-950 disabled:opacity-45',
  link: 'font-bold text-blue underline-offset-4 hover:underline',
};
export const card = 'cut bg-white';
export const input = 'cut-sm w-full bg-navy-50 px-3 py-2.5 text-[15px] outline-none inset-ring-1 inset-ring-line placeholder:text-ink-3 focus:bg-white focus:inset-ring-2 focus:inset-ring-gold';

type IconName = 'home' | 'tests' | 'present' | 'roleplay' | 'progress' | 'admin' | 'arrow' | 'back' | 'external' | 'close' | 'book' | 'clock' | 'check' | 'mic' | 'search' | 'spark';
const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9',
  tests: 'M8 4h8v3H8zM6 5.5H4.5V21h15V5.5H18M8 12h8M8 16h5',
  present: 'M3 4h18v12H3zM12 16v4M8 20h8M7 12l3-3 2.5 2.5L17 7',
  roleplay: 'M4 5h11v8H9l-4 3v-3H4zM15 9h5v8h-1v3l-4-3h-4v-2',
  progress: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  admin: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19 12l2-1.5-2-3.5-2.4.6-1.6-1.2L14.5 4h-5L9 6.4 7.4 7.6 5 7 3 10.5 5 12l-2 1.5L5 17l2.4-.6 1.6 1.2.5 2.4h5l.5-2.4 1.6-1.2 2.4.6 2-3.5z',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  back: 'M20 12H5M11 6l-6 6 6 6',
  external: 'M9 5H5v14h14v-4M13 4h7v7M20 4l-9 9',
  close: 'M6 6l12 12M18 6 6 18',
  book: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  check: 'M5 12.5 10 17l9-10',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
};
export function Icon({ name, className = 'h-5 w-5', stroke = 2 }: { name: IconName; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The chapter's logo from the chapter site, with a text fallback. */
export function Logo({ light = false }: { light?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`whitespace-nowrap font-wide text-[17px] font-black tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>SBHS FBLA</span>;
  }
  return <img src={light ? mainSite.logoLight : mainSite.logo} alt="South Brunswick High School FBLA" className="h-9 w-auto" onError={() => setFailed(true)} />;
}

export function Bar({ pct, tone, thick = false }: { pct: number | null; tone?: 'auto' | 'navy' | 'gold'; thick?: boolean }) {
  const v = pct ?? 0;
  const color = tone === 'navy' ? 'bg-navy-900' : tone === 'gold' ? 'bg-gold' : pct === null ? 'bg-line' : v >= 80 ? 'bg-good' : v >= 60 ? 'bg-gold' : 'bg-bad';
  return (
    <div className={`${thick ? 'h-2.5' : 'h-1.5'} w-full overflow-hidden bg-navy-100`} role="presentation">
      <div className={`h-full ${color} transition-[width] duration-500`} style={{ width: `${pct === null ? 0 : Math.max(2, Math.min(100, v))}%` }} />
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'bad' | 'gold' | 'good'; children: ReactNode }) {
  const cls = tone === 'bad' ? 'bg-bad-100 text-bad' : tone === 'gold' ? 'bg-gold-100 text-navy-950' : tone === 'good' ? 'bg-good-100 text-good' : 'bg-navy-100 text-navy-900';
  return <div className={`cut-sm px-4 py-3 text-[15px] font-semibold ${cls}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner({ light = false }: { light?: boolean }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${light ? 'border-white/80' : 'border-navy-900'} border-t-transparent`} aria-hidden="true" />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-14 text-ink-2" role="status">
      <Spinner />
      <span className="font-semibold">{label}</span>
    </div>
  );
}

/** Small uppercase label above a heading. */
export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`font-semiwide text-[12px] font-extrabold uppercase tracking-[0.12em] ${light ? 'text-gold' : 'text-blue'}`}>{children}</p>;
}

export function PageHead({ title, eyebrow, sub, right, back }: { title: string; eyebrow?: ReactNode; sub?: ReactNode; right?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-8 short:mb-6">
      {back && (
        <Link to={back.to} className={`${btn.ghost} mb-3`}>
          <Icon name="back" className="h-4 w-4" stroke={2.4} />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2"><Eyebrow>{eyebrow}</Eyebrow></div>}
          <h1 className="font-wide text-[clamp(28px,3.4vw,40px)] font-black leading-[1.02] tracking-[-0.02em] text-navy-950">{title}</h1>
          {sub && <div className="mt-2 max-w-[60ch] text-[16px] text-ink-2">{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

/** A section with a ruled heading, like the lines of a rating sheet. */
export function Section({ title, count, right, children, className = '' }: { title: string; count?: number; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-navy-900 pb-2">
        <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">
          {title}
          {count !== undefined && <span className="ml-2 font-wide text-[14px] font-black tabular-nums text-ink-3">{count}</span>}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function External({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 ${className}`}>{children}<Icon name="external" className="h-3.5 w-3.5 shrink-0" /></a>;
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="cut-sm flex h-11 w-72 max-w-full items-center gap-2 bg-white px-3 inset-ring-1 inset-ring-line focus-within:inset-ring-2 focus-within:inset-ring-gold">
      <Icon name="search" className="h-4 w-4 text-ink-3" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
    </label>
  );
}

/* ---------- Focus mode: tests and presentations hide the site menu ---------- */

const FocusContext = createContext<(on: boolean) => void>(() => {});
/** While a page is in focus mode, the header, footer, and tab bar are hidden so everything fits on a Chromebook screen. */
export function useFocusMode(on: boolean) {
  const set = useContext(FocusContext);
  useEffect(() => { set(on); return () => set(false); }, [on, set]);
}

/* ---------- Layout ---------- */

const NAV: { to: string; label: string; short: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', short: 'Home', icon: 'home', end: true },
  { to: '/practice', label: 'Tests', short: 'Tests', icon: 'tests' },
  { to: '/present', label: 'Presentations', short: 'Present', icon: 'present' },
  { to: '/roleplay', label: 'Role plays', short: 'Role plays', icon: 'roleplay' },
  { to: '/progress', label: 'Progress', short: 'Progress', icon: 'progress' },
];

function Avatar({ size = 'h-9 w-9' }: { size?: string }) {
  const { profile } = useAuth();
  if (profile?.picture) return <img src={profile.picture} alt="" className={`${size} rounded-full`} referrerPolicy="no-referrer" />;
  return <span className={`${size} grid place-items-center rounded-full bg-navy-900 text-[14px] font-black text-gold`}>{profile?.givenName.slice(0, 1) || '?'}</span>;
}

function AccountMenu({ admin }: { admin: boolean }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!profile) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account" className="flex items-center gap-2 rounded-full p-0.5 transition hover:ring-2 hover:ring-navy-100">
        <Avatar />
      </button>
      {open && (
        <div className="cut absolute right-0 top-12 z-40 w-64 bg-white p-2 shadow-[0_10px_40px_-10px_rgb(6_18_46_/_0.35)] animate-rise">
          <div className="px-3 py-2.5">
            <div className="truncate font-bold text-navy-950">{profile.name}</div>
            <div className="truncate text-[13px] text-ink-2">{profile.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          {admin && <Link to="/admin" className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-bold text-navy-950 hover:bg-navy-50"><Icon name="admin" className="h-4 w-4" />Admin</Link>}
          <a href={mainSite.home} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-bold text-navy-950 hover:bg-navy-50"><Icon name="external" className="h-4 w-4" />Chapter site</a>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] font-bold text-bad hover:bg-bad-100"><Icon name="back" className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { status } = useAuth();
  const admin = useOptionalAdmin();
  const link = ({ isActive }: { isActive: boolean }) =>
    `relative flex h-16 items-center px-3 text-[15px] font-bold transition ${isActive ? 'text-navy-950 after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:bg-gold' : 'text-ink-2 hover:text-navy-950'}`;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link to="/" className="flex shrink-0 items-center" aria-label="FBLA Prep home"><Logo /></Link>
        {status === 'signedIn' && (
          <nav className="ml-4 hidden items-center md:flex" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>)}
            {admin && <NavLink to="/admin" className={link}>Admin</NavLink>}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-4">
          {status !== 'signedIn' && <External href={mainSite.home} className="text-[14px] font-bold text-ink-2 hover:text-navy-950">Chapter site</External>}
          {status === 'signedIn' && <AccountMenu admin={admin} />}
        </div>
      </div>
    </header>
  );
}

/** Bottom tab bar on phones. */
function TabBar() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold ${isActive ? 'text-navy-950' : 'text-ink-3'}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={tab}>
          {({ isActive }) => (<><span className={`grid h-7 w-10 place-items-center ${isActive ? 'cut-sm bg-gold' : ''}`}><Icon name={n.icon} className="h-[18px] w-[18px]" /></span>{n.short}</>)}
        </NavLink>
      ))}
    </nav>
  );
}

/** The header renders outside the data provider when signed out, so read admin status defensively. */
function useOptionalAdmin(): boolean {
  const d = useDataMaybe();
  return !!d?.data?.me.admin;
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-7">
        <Logo />
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-bold text-ink-2" aria-label="Chapter site">
          <External href={mainSite.competitions()} className="hover:text-navy-950">Competitions</External>
          <External href={mainSite.eventFinder} className="hover:text-navy-950">Event Finder</External>
          <External href={mainSite.schedule} className="hover:text-navy-950">Events</External>
          <External href={mainSite.home} className="hover:text-navy-950">Chapter site</External>
        </nav>
      </div>
    </footer>
  );
}

export function Layout() {
  const { status } = useAuth();
  const [focus, setFocusState] = useState(false);
  const setFocus = useCallback((on: boolean) => setFocusState(on), []);
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);
  const tabs = status === 'signedIn' && !focus;
  return (
    <FocusContext.Provider value={setFocus}>
      <div className={`flex min-h-dvh flex-col ${tabs ? 'pb-16 md:pb-0' : ''}`}>
        {DEMO && !focus && (
          <div className="bg-gold px-5 py-1.5 text-center text-[13px] font-bold text-navy-950">Demo mode. Sample content, saved on this device only.</div>
        )}
        {!focus && <Header />}
        <main className={`mx-auto w-full flex-1 px-5 ${focus ? 'max-w-5xl pt-4 pb-8' : 'max-w-6xl pt-8 short:pt-6'}`}>
          <Outlet />
        </main>
        {!focus && <Footer />}
        {tabs && <TabBar />}
      </div>
    </FocusContext.Provider>
  );
}
