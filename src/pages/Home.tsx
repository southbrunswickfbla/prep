import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CLIENT_ID, DEMO, RCE_TESTING_DATE, mainSite } from '../lib/config';
import { daysUntil, eventMastery, LEVEL_LABEL, LEVELS, longDate, MODE_LABEL, shortDate, plural } from '../lib/format';
import { Bar, btn, External, Loading, Notice } from '../components/Layout';

function Countdown({ compact = false }: { compact?: boolean }) {
  const days = daysUntil(RCE_TESTING_DATE);
  if (days < 0) return null;
  if (compact) {
    return (
      <span className="cut-sm inline-flex items-baseline gap-2 bg-gold px-3 py-1.5 text-navy-950">
        <b className="font-wide text-lg font-black">{days}</b>
        <span className="text-[14px] font-bold">{days === 1 ? 'day' : 'days'} until RCE testing</span>
      </span>
    );
  }
  return (
    <div className="cut bg-white/[0.06] p-6 text-white inset-ring-1 inset-ring-white/10">
      <div className="font-wide text-[clamp(72px,12vw,128px)] font-black leading-[0.8] tracking-tight text-gold">{days}</div>
      <div className="mt-4 font-semiwide text-lg font-extrabold">{days === 0 ? 'RCE testing starts today' : `${days === 1 ? 'day' : 'days'} until RCE testing`}</div>
      <div className="mt-1 text-[15px] text-navy-200">{longDate(RCE_TESTING_DATE)}</div>
    </div>
  );
}

export function Landing() {
  const { renderButton, demoSignIn, error, status } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  useEffect(() => { renderButton(btnRef.current); }, [renderButton, status]);

  return (
    <div className="animate-rise">
      <section className="ledger cut-lg grid gap-10 px-6 py-12 pl-[84px] text-white sm:px-10 sm:pl-[96px] lg:grid-cols-[1.5fr_1fr] lg:items-end short:py-8">
        <div>
          <p className="font-semiwide text-[15px] font-extrabold text-gold">South Brunswick FBLA</p>
          <h1 className="mt-3 font-wide text-[clamp(40px,7vw,80px)] font-black leading-[0.92] tracking-tight">Practice like it’s RCE.</h1>
          <p className="mt-5 max-w-[46ch] text-[18px] leading-relaxed text-navy-100">
            AI-written practice for every FBLA objective test. Answers are graded the moment you pick them, and the topics you miss keep coming back until you get them right.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {DEMO
              ? <button className={btn.gold} onClick={demoSignIn}>Try the demo</button>
              : CLIENT_ID ? <div ref={btnRef} className="min-h-[44px]" /> : null}
            <span className="text-[14px] text-navy-200">{DEMO ? 'No sign-in needed in demo mode.' : 'Use your @sbstudents.org Google account.'}</span>
          </div>
          {error && <div className="mt-5 max-w-xl"><Notice tone="bad">{error}</Notice></div>}
        </div>
        <Countdown />
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-3">
        {[
          ['Pick your event and level', 'All 45 FBLA events with a test, built from the official 2026–27 guidelines. Practice at RCE, SLC, or NLC difficulty.'],
          ['Study, then drill', 'Read an AI study guide for each topic, then drill it ten questions at a time with instant explanations.'],
          ['Take full practice tests', '100 questions in 50 minutes, split like the real test. Every miss goes on your review list until you get it right.'],
        ].map(([title, body], i) => (
          <div key={title} className="cut bg-white p-6">
            <div className="font-wide text-4xl font-black text-gold">{i + 1}</div>
            <h2 className="mt-3 font-semiwide text-xl font-extrabold text-navy-950">{title}</h2>
            <p className="mt-2 text-[16px] text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-[15px] text-ink-2">
        Not sure which event to pick? Try the <External href={mainSite.eventFinder} className={btn.link}>Event Finder</External> on the chapter site.
      </p>
    </div>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const { data, loading, error } = useData();
  if (loading && !data) return <Loading label="Loading your events…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const practiced = data.events
    .map((e) => ({ e, m: eventMastery(data.mastery, e.id), last: data.recent.find((r) => r.eventId === e.id)?.submitted || '' }))
    .filter((x) => x.m.attempts > 0)
    .sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div className="animate-rise">
      <section className="ledger cut-lg flex flex-wrap items-end justify-between gap-6 px-6 py-10 pl-[84px] text-white sm:px-10 sm:pl-[96px] short:py-7">
        <div>
          <h1 className="font-wide text-[clamp(34px,6vw,60px)] font-black leading-[0.95] tracking-tight">Welcome back, {profile?.givenName || 'friend'}.</h1>
          <div className="mt-5"><Countdown compact /></div>
        </div>
        <Link to="/practice" className={btn.gold}>Start practicing</Link>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Your events</h2>
          {practiced.length === 0 ? (
            <div className="cut mt-4 bg-white p-6">
              <p className="text-[17px] text-ink-2">You haven’t practiced yet. Pick the event you’re testing in and start with a 10-question drill.</p>
              <Link to="/practice" className={`${btn.navy} mt-5`}>Pick an event</Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {practiced.map(({ e, m }) => (
                <div key={e.id} className="cut bg-white p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link to={`/practice/${e.id}`} className="font-semiwide text-lg font-extrabold text-navy-950 hover:text-blue">{e.name}</Link>
                    <span className="text-[14px] font-bold text-ink-2">{m.pct}% correct across {plural(m.attempts, 'question')}</span>
                  </div>
                  <div className="mt-3"><Bar pct={m.pct} /></div>
                  {(() => {
                    const bests = data.bests.filter((b) => b.eventId === e.id);
                    return bests.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {LEVELS.filter((l) => bests.some((b) => b.level === l.id)).map((l) => (
                          <span key={l.id} className="cut-sm bg-navy-100 px-2 py-0.5 text-[12px] font-black text-navy-900">{l.label} test best {bests.find((b) => b.level === l.id)!.best}%</span>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/practice/${e.id}?go=weak`} className={btn.quiet}>Drill weak spots</Link>
                    {(data.missed.find((x) => x.eventId === e.id)?.count || 0) > 0 && (
                      <Link to={`/practice/${e.id}?go=review`} className={btn.quiet}>Review {plural(data.missed.find((x) => x.eventId === e.id)!.count, 'mistake')}</Link>
                    )}
                    <Link to={`/practice/${e.id}`} className={btn.quiet}>More options</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Recent sessions</h2>
          {data.recent.length === 0 ? (
            <p className="mt-4 text-ink-2">Your finished drills and tests show up here.</p>
          ) : (
            <ul className="cut mt-4 divide-y divide-line bg-white">
              {data.recent.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link to={`/results/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-navy-100/50">
                    <span>
                      <span className="block font-bold text-navy-950">{r.eventName}</span>
                      <span className="text-[13px] text-ink-2">{MODE_LABEL[r.mode]}{r.mode !== 'review' && r.level ? ` (${LEVEL_LABEL[r.level]})` : ''}, {shortDate(r.submitted)}</span>
                    </span>
                    <span className={`font-wide text-xl font-black ${r.pct >= 80 ? 'text-good' : r.pct >= 60 ? 'text-navy-900' : 'text-bad'}`}>{r.pct}%</span>
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
