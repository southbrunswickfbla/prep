import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';
import { useDataMaybe } from '../lib/data';
import { DEMO, mainSite } from '../lib/config';

/* ---------- Small shared pieces ---------- */

export const btn = {
  gold: 'cut-sm inline-flex items-center justify-center gap-2 bg-gold px-5 py-3 font-semiwide text-[15px] font-extrabold text-navy-950 transition hover:bg-gold-300 disabled:opacity-50',
  navy: 'cut-sm inline-flex items-center justify-center gap-2 bg-navy-900 px-5 py-3 font-semiwide text-[15px] font-bold text-white transition hover:bg-navy-700 disabled:opacity-50',
  quiet: 'cut-sm inline-flex items-center justify-center gap-2 bg-navy-100 px-4 py-2.5 text-[14px] font-bold text-navy-900 transition hover:bg-navy-200 disabled:opacity-50',
  link: 'font-bold text-blue underline-offset-4 hover:underline',
};

export function Logo({ light = false }: { light?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`whitespace-nowrap font-wide text-lg font-black tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>SBHS FBLA</span>;
  }
  return <img src={light ? mainSite.logoLight : mainSite.logo} alt="South Brunswick High School FBLA" className="h-10 w-auto" onError={() => setFailed(true)} />;
}

export function Bar({ pct, tone }: { pct: number | null; tone?: 'auto' | 'navy' }) {
  const v = pct ?? 0;
  const color = tone === 'navy' ? 'bg-navy-900' : pct === null ? 'bg-line' : v >= 80 ? 'bg-good' : v >= 60 ? 'bg-gold' : 'bg-bad';
  return (
    <div className="h-2 w-full overflow-hidden bg-navy-100" role="presentation">
      <div className={`h-full ${color} transition-[width] duration-500`} style={{ width: `${pct === null ? 0 : Math.max(3, v)}%` }} />
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'bad' | 'gold'; children: ReactNode }) {
  const cls = tone === 'bad' ? 'bg-bad-100 text-bad' : tone === 'gold' ? 'bg-gold-100 text-navy-950' : 'bg-navy-100 text-navy-900';
  return <div className={`cut-sm px-4 py-3 text-[15px] font-semibold ${cls}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-ink-2" role="status">
      <span className="inline-block h-4 w-4 animate-spin border-2 border-navy-900 border-t-transparent" />
      <span className="font-semibold">{label}</span>
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 short:mb-5">
      <div>
        <h1 className="font-wide text-[clamp(30px,5vw,48px)] font-black leading-[0.98] tracking-tight text-navy-950">{title}</h1>
        {sub && <p className="mt-3 max-w-[62ch] text-[17px] text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9" />
    </svg>
  );
}
export function External({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 ${className}`}>{children}<ExternalIcon /></a>;
}

/* ---------- Layout ---------- */

function Header() {
  const { status, profile, signOut } = useAuth();
  const data = useOptionalAdmin();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      setHidden(y > 120 && y > last);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const link = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap px-3 py-2 text-[15px] font-bold transition ${isActive ? 'text-navy-950 shadow-[inset_0_-3px_0_var(--color-gold)]' : 'text-ink-2 hover:text-navy-950'}`;

  return (
    <header className={`sticky top-0 z-30 transition-transform duration-300 ${hidden ? '-translate-y-full' : ''} ${scrolled ? 'bg-white/80 shadow-[0_1px_0_var(--color-line)] backdrop-blur-md' : 'bg-paper'}`}>
      <div className="mx-auto flex h-[76px] max-w-6xl items-center gap-3 px-5 short:h-[64px]">
        <Link to="/" className="flex items-center gap-3" aria-label="FBLA Prep home">
          <Logo />
          <span className="cut-sm bg-navy-900 px-2.5 py-1 font-wide text-[13px] font-black text-gold">PREP</span>
        </Link>
        {status === 'signedIn' && (
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/practice" className={link}>Tests</NavLink>
            <NavLink to="/present" className={link}>Presentations</NavLink>
            <NavLink to="/progress" className={link}>Progress</NavLink>
            {data?.admin && <NavLink to="/admin" className={link}>Admin</NavLink>}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden sm:inline"><External href={mainSite.home} className="text-[14px] font-bold text-ink-2 hover:text-navy-950">Chapter site</External></span>
          {status === 'signedIn' && profile && (
            <div className="flex items-center gap-2">
              {profile.picture
                ? <img src={profile.picture} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
                : <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-900 text-sm font-black text-gold">{profile.givenName.slice(0, 1) || '?'}</span>}
              <button onClick={signOut} className="whitespace-nowrap text-[14px] font-bold text-ink-2 hover:text-navy-950">Sign out</button>
            </div>
          )}
        </div>
      </div>
      {status === 'signedIn' && (
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 md:hidden" aria-label="Main">
          <NavLink to="/" end className={link}>Home</NavLink>
          <NavLink to="/practice" className={link}>Tests</NavLink>
          <NavLink to="/present" className={link}>Presentations</NavLink>
          <NavLink to="/progress" className={link}>Progress</NavLink>
          {data?.admin && <NavLink to="/admin" className={link}>Admin</NavLink>}
        </nav>
      )}
    </header>
  );
}

/** The header renders outside the data provider when signed out, so read admin status defensively. */
function useOptionalAdmin(): { admin: boolean } | null {
  const d = useDataMaybe();
  return d?.data ? { admin: d.data.me.admin } : null;
}

function Footer() {
  return (
    <footer className="ledger mt-24 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 pl-[84px] sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-sm text-[15px] text-navy-200">Practice tests for South Brunswick High School FBLA members. Questions are written by AI, so report anything that looks wrong.</p>
        </div>
        <div>
          <p className="font-semiwide text-[15px] font-extrabold text-gold">Chapter site</p>
          <ul className="mt-3 space-y-2 text-[15px] text-navy-100">
            <li><External href={mainSite.competitions()} className="hover:text-white">Competitions and guidelines</External></li>
            <li><External href={mainSite.eventFinder} className="hover:text-white">Event Finder</External></li>
            <li><External href={mainSite.schedule} className="hover:text-white">Events and sign-ups</External></li>
          </ul>
        </div>
        <div>
          <p className="font-semiwide text-[15px] font-extrabold text-gold">Prep</p>
          <ul className="mt-3 space-y-2 text-[15px] text-navy-100">
            <li><Link to="/practice" className="hover:text-white">Test practice</Link></li>
            <li><Link to="/present" className="hover:text-white">Presentation judge</Link></li>
            <li><Link to="/progress" className="hover:text-white">Your progress</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      {DEMO && (
        <div className="bg-gold px-5 py-2 text-center text-[14px] font-bold text-navy-950">
          Demo mode: sample questions only, saved on this device. Connect the backend to go live.
        </div>
      )}
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 short:pt-5">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
