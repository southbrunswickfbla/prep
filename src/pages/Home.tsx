import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CLIENT_ID, DEMO, RCE_TESTING_DATE } from '../lib/config';
import { daysUntil, eventMastery, LEVEL_LABEL, longDate, MODE_LABEL, shortDate } from '../lib/format';
import { Bar, btn, Loading, Notice } from '../components/Layout';
import { AnswerSheet, ModeTiles, ScorePip } from '../components/Bits';

function Countdown({ onDark = true }: { onDark?: boolean }) {
  const days = daysUntil(RCE_TESTING_DATE);
  if (days < 0) return null;
  return (
    <div className="cut inline-flex items-center gap-4 bg-gold py-3 pl-4 pr-6 text-navy-950">
      <span className="font-wide text-[44px] font-black leading-none tabular-nums">{days}</span>
      <span className="leading-tight">
        <span className="block text-[15px] font-black">{days === 0 ? 'RCE testing is today' : `${days === 1 ? 'day' : 'days'} to RCE testing`}</span>
        <span className={`block text-[13px] font-semibold ${onDark ? 'text-navy-900/75' : 'text-navy-900/75'}`}>{longDate(RCE_TESTING_DATE)}</span>
      </span>
    </div>
  );
}

const MODES = [
  { to: '/practice', count: '45', title: 'Tests', line: 'Drills and full practice tests, RCE through NLC difficulty.' },
  { to: '/present', count: '32', title: 'Presentations', line: 'Present out loud. Scored on the official rating sheet.' },
  { to: '/roleplay', count: '12', title: 'Role plays', line: 'A new scenario every time. The judge interrupts.' },
];

export function Landing() {
  const { renderButton, demoSignIn, error, status } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  useEffect(() => { renderButton(btnRef.current); }, [renderButton, status]);

  return (
    <div>
      <section className="ledger cut-lg grid gap-10 overflow-hidden px-6 py-12 pl-[72px] text-white sm:px-10 sm:pl-[100px] lg:grid-cols-[1fr_auto] lg:items-center lg:py-16 short:py-8">
        <div className="animate-rise">
          <h1 className="font-wide text-[clamp(44px,7.4vw,92px)] font-black leading-[0.9] tracking-[-0.03em]">Practice like<br />it’s RCE.</h1>
          <p className="mt-6 max-w-[34ch] text-[19px] leading-snug text-navy-100">Tests, presentations, and role plays for every FBLA event, judged on this year’s guidelines.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {DEMO
              ? <button className={btn.gold} onClick={demoSignIn}>Try the demo</button>
              : CLIENT_ID ? <div ref={btnRef} className="min-h-[44px]" /> : null}
            {!DEMO && <span className="text-[14px] text-navy-200">Use your @sbstudents.org account.</span>}
          </div>
          {error && <div className="mt-5 max-w-xl"><Notice tone="bad">{error}</Notice></div>}
          <div className="mt-10"><Countdown /></div>
        </div>
        <div className="hidden pr-4 lg:block"><AnswerSheet /></div>
      </section>

      <div className="mt-6"><ModeTiles modes={MODES} /></div>
    </div>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const { data, loading, error } = useData();
  if (loading && !data) return <Loading label="Loading…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const practiced = data.events
    .map((e) => ({ e, m: eventMastery(data.mastery, e.id), last: data.recent.find((r) => r.eventId === e.id)?.submitted || '', missed: data.missed.find((x) => x.eventId === e.id)?.count || 0 }))
    .filter((x) => x.m.attempts > 0)
    .sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div>
      <section className="ledger cut-lg flex flex-wrap items-end justify-between gap-6 px-6 py-10 pl-[72px] text-white sm:px-10 sm:pl-[100px] short:py-7">
        <h1 className="font-wide text-[clamp(36px,6vw,68px)] font-black leading-[0.92] tracking-[-0.03em]">Welcome back,<br />{profile?.givenName || 'friend'}.</h1>
        <Countdown />
      </section>

      <div className="mt-6"><ModeTiles modes={MODES} /></div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between border-b-[3px] border-navy-900 pb-2">
            <h2 className="font-wide text-[19px] font-black text-navy-950">Your tests</h2>
            <Link to="/progress" className="text-[14px] font-bold text-blue hover:underline">Progress</Link>
          </div>
          {practiced.length === 0 ? (
            <div className="py-8">
              <p className="text-[16px] text-ink-2">Nothing yet. Start with a 10-question drill.</p>
              <Link to="/practice" className={`${btn.navy} mt-4`}>Pick a test</Link>
            </div>
          ) : (
            <ul>
              {practiced.map(({ e, m, missed }) => (
                <li key={e.id} className="border-b border-line py-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link to={`/practice/${e.id}`} className="min-w-0 truncate text-[16px] font-bold text-navy-950 hover:text-blue">{e.name}</Link>
                    <ScorePip pct={m.pct} />
                  </div>
                  <div className="mt-2.5"><Bar pct={m.pct} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/practice/${e.id}?go=weak`} className={btn.quiet}>Weak spots</Link>
                    {missed > 0 && <Link to={`/practice/${e.id}?go=review`} className={btn.quiet}>Review {missed} missed</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="border-b-[3px] border-navy-900 pb-2">
            <h2 className="font-wide text-[19px] font-black text-navy-950">Recent</h2>
          </div>
          {data.recent.length === 0 ? (
            <p className="py-8 text-[16px] text-ink-2">Finished drills and tests show up here.</p>
          ) : (
            <ul>
              {data.recent.slice(0, 8).map((r) => (
                <li key={r.id} className="border-b border-line">
                  <Link to={`/results/${r.id}`} className="group -mx-2 flex items-center justify-between gap-3 px-2 py-3 hover:bg-white">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-navy-950 group-hover:text-blue">{r.eventName}</span>
                      <span className="text-[13px] text-ink-2">{MODE_LABEL[r.mode]}{r.mode !== 'review' && r.level ? `, ${LEVEL_LABEL[r.level]}` : ''}, {shortDate(r.submitted)}</span>
                    </span>
                    <ScorePip pct={r.pct} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
