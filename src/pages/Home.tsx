import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CLIENT_ID, DEMO, RCE_TESTING_DATE } from '../lib/config';
import { daysUntil, eventMastery, LEVEL_LABEL, MODE_LABEL, plural, shortDate } from '../lib/format';
import { Bar, btn, Eyebrow, Icon, Loading, Notice, Section } from '../components/Layout';
import { AnswerSheet, LaneCards, ScorePip } from '../components/Bits';

function Countdown() {
  const days = daysUntil(RCE_TESTING_DATE);
  if (days < 0) return null;
  const date = new Date(RCE_TESTING_DATE + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="cut-sm inline-flex items-center gap-3 bg-white/10 py-2 pl-3 pr-4 text-white">
      <span className="font-wide text-[28px] font-black leading-none tabular-nums text-gold">{days}</span>
      <span className="text-[13px] font-semibold leading-tight text-navy-100">
        {days === 0 ? 'RCE testing is today' : <>{days === 1 ? 'day' : 'days'} to RCE testing<br />{date}</>}
      </span>
    </div>
  );
}

export function Landing() {
  const { renderButton, demoSignIn, error, status } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  useEffect(() => { renderButton(btnRef.current); }, [renderButton, status]);

  return (
    <div className="animate-rise">
      <section className="ledger cut-lg grid gap-10 overflow-hidden py-12 pl-[68px] pr-6 text-white sm:pl-[88px] sm:pr-10 lg:grid-cols-[1fr_auto] lg:items-center lg:py-14 short:py-9">
        <div>
          <Eyebrow light>South Brunswick FBLA</Eyebrow>
          <h1 className="mt-3 font-wide text-[clamp(44px,6.6vw,80px)] font-black leading-[0.92] tracking-[-0.03em]">FBLA Prep</h1>
          <p className="mt-4 max-w-[40ch] text-[18px] leading-snug text-navy-100">Tests, presentations, and role plays for every FBLA event, scored on the 2026–27 guidelines.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            {DEMO
              ? <button className={btn.gold} onClick={demoSignIn}>Try the demo</button>
              : CLIENT_ID ? <div ref={btnRef} className="min-h-[44px]" /> : null}
            {!DEMO && <span className="text-[14px] text-navy-200">Use your @sbstudents.org account.</span>}
          </div>
          {error && <div className="mt-5 max-w-xl"><Notice tone="bad">{error}</Notice></div>}
          <div className="mt-8"><Countdown /></div>
        </div>
        <div className="hidden pr-2 lg:block"><AnswerSheet /></div>
      </section>
      <div className="mt-4"><LaneCards linked={false} /></div>
    </div>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const { data, loading, error } = useData();
  if (loading && !data) return <Loading />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const practiced = data.events
    .map((e) => ({ e, m: eventMastery(data.mastery, e.id), last: data.recent.find((r) => r.eventId === e.id)?.submitted || '', missed: data.missed.find((x) => x.eventId === e.id)?.count || 0 }))
    .filter((x) => x.m.attempts > 0)
    .sort((a, b) => b.last.localeCompare(a.last));
  const top = practiced[0];

  return (
    <div className="animate-rise">
      <section className="ledger cut-lg flex flex-wrap items-center justify-between gap-6 py-8 pl-[68px] pr-6 text-white sm:pl-[88px] sm:pr-8 short:py-6">
        <div>
          <Eyebrow light>FBLA Prep</Eyebrow>
          <h1 className="mt-2 font-wide text-[clamp(30px,4.4vw,48px)] font-black leading-[0.95] tracking-[-0.025em]">Hi, {profile?.givenName || 'there'}.</h1>
        </div>
        <Countdown />
      </section>

      {top && (
        <section className="cut mt-4 grid gap-4 bg-white p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink-3">Pick up where you left off</p>
            <div className="mt-1 flex items-center gap-3">
              <Link to={`/practice/${top.e.id}`} className="truncate font-wide text-[20px] font-black text-navy-950 hover:text-blue">{top.e.name}</Link>
              <ScorePip pct={top.m.pct} />
            </div>
            <div className="mt-3 max-w-md"><Bar pct={top.m.pct} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/practice/${top.e.id}?go=drill`} className={btn.navy}>Quick drill</Link>
            <Link to={`/practice/${top.e.id}?go=weak`} className={btn.quiet}>Weak spots</Link>
            {top.missed > 0 && <Link to={`/practice/${top.e.id}?go=review`} className={btn.quiet}>Review {top.missed} missed</Link>}
          </div>
        </section>
      )}

      <div className="mt-4"><LaneCards /></div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Your tests" right={practiced.length > 0 ? <Link to="/progress" className="text-[14px] font-bold text-blue hover:underline">All progress</Link> : undefined}>
          {practiced.length === 0 ? (
            <div className="cut bg-white p-5">
              <p className="text-[15px] text-ink-2">Nothing yet. A quick drill is 10 questions.</p>
              <Link to="/practice" className={`${btn.navy} mt-4`}>Pick a test<Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
          ) : (
            <ul className="grid gap-2">
              {practiced.slice(0, 6).map(({ e, m, missed }) => (
                <li key={e.id}>
                  <Link to={`/practice/${e.id}`} className="cut-sm group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-white px-4 py-3 hover:bg-navy-50">
                    <span className="min-w-0 truncate text-[15px] font-bold text-navy-950 group-hover:text-blue">{e.name}</span>
                    <ScorePip pct={m.pct} />
                    <span className="col-span-2 flex items-center gap-3">
                      <Bar pct={m.pct} />
                      <span className="shrink-0 text-[12px] font-bold text-ink-3">{plural(m.attempts, 'answer')}{missed ? `, ${missed} to review` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent">
          {data.recent.length === 0 ? (
            <p className="py-2 text-[15px] text-ink-2">Finished drills and tests show up here.</p>
          ) : (
            <ul className="cut divide-y divide-line bg-white">
              {data.recent.slice(0, 7).map((r) => (
                <li key={r.id}>
                  <Link to={`/results/${r.id}`} className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-navy-50">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-navy-950 group-hover:text-blue">{r.eventName}</span>
                      <span className="text-[13px] text-ink-2">{MODE_LABEL[r.mode]}{r.mode !== 'review' && r.level ? `, ${LEVEL_LABEL[r.level]}` : ''} · {shortDate(r.submitted)}</span>
                    </span>
                    <ScorePip pct={r.pct} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
