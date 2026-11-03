import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useData } from '../lib/data';
import { api, errorText } from '../lib/api';
import { mainSite } from '../lib/config';
import { eventMastery, LEVEL_LABEL, LEVELS, plural, savedLevel, saveLevel, topicMastery } from '../lib/format';
import { CONNECT_URL, STUDY_LABEL, STUDY_LINKS } from '../data/studyLinks';
import { Bar, btn, External, Loading, Notice, PageHead } from '../components/Layout';
import type { Level, Mode, StartRes } from '../types';

export const SESSION_KEY = 'fblaprep.session';

/** Starts a practice session and saves it so the session page (and a reload) can pick it up. */
export async function beginSession(eventId: string, mode: Mode, level: Level, topic?: string): Promise<StartRes> {
  const res = await api.start(eventId, mode, level, topic);
  if (!res.questions.length) throw new Error('There aren’t any questions for this yet. Try again in a few minutes.');
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ start: res, answers: {}, checked: {}, review: [], index: 0, startedAt: Date.now() }));
  return res;
}

const ORDER = ['Objective tests', '9th & 10th grade tests', 'Role play tests', 'Presentation events with a test'];
const rank = (g: string) => (ORDER.indexOf(g) < 0 ? 99 : ORDER.indexOf(g));

export function EventList() {
  const { data, loading, error } = useData();
  const [q, setQ] = useState('');
  if (loading && !data) return <Loading label="Loading events…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = data.events.filter((e) => words.every((w) => `${e.name} ${e.category}`.toLowerCase().includes(w)));
  const groups = [...new Set(list.map((e) => e.category || 'Other'))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return (
    <div className="animate-rise">
      <PageHead
        title="Pick your event"
        sub={<>Every FBLA event with an objective test, built from the official 2026–27 guidelines. Not sure which to take? Try the <External href={mainSite.eventFinder} className={btn.link}>Event Finder</External>.</>}
      />
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" aria-label="Search events"
        className="cut-sm w-full max-w-md border-0 bg-white px-4 py-3 text-[16px] outline-none inset-ring-1 inset-ring-line focus:inset-ring-2 focus:inset-ring-gold"
      />
      {data.events.length === 0 && <div className="mt-8"><Notice>No events are set up yet. An officer can load them on the Admin page.</Notice></div>}
      {data.events.length > 0 && list.length === 0 && <p className="mt-8 text-ink-2">No events match “{q}”.</p>}
      {groups.map((g) => (
        <section key={g} className="mt-10">
          <h2 className="font-semiwide text-[15px] font-extrabold text-ink-2">{g}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {list.filter((e) => (e.category || 'Other') === g).map((e) => {
              const m = eventMastery(data.mastery, e.id);
              const ready = e.topics.length > 0;
              const bests = data.bests.filter((b) => b.eventId === e.id);
              return (
                <Link key={e.id} to={`/practice/${e.id}`} className={`cut group block bg-white p-5 transition hover:bg-navy-100/40 ${ready ? '' : 'opacity-60'}`}>
                  <div className="font-semiwide text-[17px] font-extrabold text-navy-950 group-hover:text-blue">{e.name}</div>
                  <div className="mt-1 text-[14px] text-ink-2">{ready ? `${plural(e.topics.length, 'topic')}, ${plural(e.bank, 'question')} so far` : 'Topics are loading'}</div>
                  {m.pct !== null && <div className="mt-3 flex items-center gap-3"><Bar pct={m.pct} /><span className="w-12 text-right text-[14px] font-bold">{m.pct}%</span></div>}
                  {bests.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {LEVELS.filter((l) => bests.some((b) => b.level === l.id)).map((l) => (
                        <span key={l.id} className="cut-sm bg-navy-100 px-2 py-0.5 text-[12px] font-black text-navy-900">{l.label} best {bests.find((b) => b.level === l.id)!.best}%</span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <div role="radiogroup" aria-label="Practice level" className="grid gap-2 sm:grid-cols-3">
      {LEVELS.map((l) => {
        const on = value === l.id;
        return (
          <button
            key={l.id} role="radio" aria-checked={on} onClick={() => onChange(l.id)}
            className={`cut-sm px-4 py-3 text-left transition ${on ? 'bg-navy-900 text-white' : 'bg-white text-ink hover:bg-navy-100/60'}`}
          >
            <span className={`font-wide text-xl font-black ${on ? 'text-gold' : 'text-navy-900'}`}>{l.label}</span>
            <span className={`ml-2 text-[13px] font-bold ${on ? 'text-navy-100' : 'text-ink-2'}`}>{l.name}</span>
            <span className={`mt-1 block text-[13px] ${on ? 'text-navy-100' : 'text-ink-2'}`}>{l.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EventDetail() {
  const { eventId = '' } = useParams();
  const [params] = useSearchParams();
  const { data, loading, error } = useData();
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level>(() => savedLevel(eventId));
  const [starting, setStarting] = useState('');
  const [startError, setStartError] = useState('');
  const auto = useRef(false);

  const event = data?.events.find((e) => e.id === eventId);
  const practiced = useMemo(() => (data && event ? eventMastery(data.mastery, event.id).attempts : 0), [data, event]);
  const missed = data?.missed.find((m) => m.eventId === eventId)?.count || 0;

  function pickLevel(l: Level) { setLevel(l); saveLevel(eventId, l); }

  async function start(mode: Mode, topic?: string) {
    if (!event) return;
    setStarting(mode + (topic || '')); setStartError('');
    try { await beginSession(event.id, mode, level, topic); navigate('/session'); }
    catch (e) { setStartError(errorText(e)); setStarting(''); }
  }

  // Links like /practice/accounting?go=weak start right away.
  useEffect(() => {
    const go = params.get('go');
    if (event && !auto.current && (go === 'weak' || go === 'drill' || go === 'review')) { auto.current = true; void start(go); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;
  if (!event) return <Notice tone="bad">That event isn’t available. <Link to="/practice" className={btn.link}>See all events</Link></Notice>;

  const ready = event.topics.length > 0;
  const study = STUDY_LINKS[event.name];
  const bests = data.bests.filter((b) => b.eventId === event.id);
  const lv = LEVEL_LABEL[level];
  const modes: { mode: Mode; title: string; body: string; note?: string; disabled?: boolean }[] = [
    { mode: 'drill', title: 'Quick drill', body: `10 ${lv}-level questions from every topic, checked as you go, with explanations.` },
    { mode: 'weak', title: 'Weak-spot drill', body: `10 ${lv}-level questions, mostly from the topics you miss most.`, note: practiced ? undefined : 'Do a quick drill first so it knows your weak spots.', disabled: !practiced },
    { mode: 'review', title: 'Mistake review', body: 'Questions you got wrong before. Each one leaves the list once you get it right.', note: missed ? `${plural(missed, 'question')} waiting.` : 'Nothing to review yet.', disabled: !missed },
  ];

  return (
    <div className="animate-rise">
      <Link to="/practice" className="text-[14px] font-bold text-ink-2 hover:text-navy-950">All events</Link>
      <div className="mt-3">
        <PageHead
          title={event.name}
          sub={<>{event.category || 'Practice'}. Topics and question counts come from FBLA’s official 2026–27 guidelines.</>}
        />
      </div>

      {!ready && <Notice>This event’s topics are still loading from the guidelines. Check back in a few minutes.</Notice>}
      {startError && <div className="mb-6"><Notice tone="bad">{startError}</Notice></div>}
      {starting && <div className="mb-6"><Notice tone="gold">Getting your questions ready. If the AI has to write new ones, this can take up to 30 seconds.</Notice></div>}

      {ready && (
        <>
          <section>
            <h2 className="font-semiwide text-lg font-extrabold text-navy-950">Level</h2>
            <p className="mb-3 text-[14px] text-ink-2">Start at RCE and move up as your scores climb. Everything below uses the level you pick.</p>
            <LevelPicker value={level} onChange={pickLevel} />
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="cut flex flex-col bg-navy-900 p-6 text-white">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-semiwide text-xl font-extrabold text-gold">Full {lv} practice test</h2>
                {bests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {LEVELS.filter((l) => bests.some((b) => b.level === l.id)).map((l) => {
                      const b = bests.find((x) => x.level === l.id)!;
                      return <span key={l.id} className="cut-sm bg-white/10 px-2 py-0.5 text-[12px] font-bold text-navy-100">{l.label}: best {b.best}%, last {b.last}%</span>;
                    })}
                  </div>
                )}
              </div>
              <p className="mt-2 flex-1 text-[15px] text-navy-100">
                {event.bank >= 100 ? '100 questions in 50 minutes' : `${Math.min(100, event.bank)} questions so far, timed to match`}, split across topics like the real test. Answers stay hidden until you submit.
              </p>
              <button className={`${btn.gold} mt-5 self-start`} disabled={!!starting || event.bank < 10} onClick={() => start('full')}>
                {starting === 'full' ? 'Starting…' : `Start the ${lv} test`}
              </button>
              {event.bank < 10 && <p className="mt-3 text-[14px] font-semibold text-gold-300">Questions are still being written. Try a quick drill in the meantime.</p>}
            </div>

            <div className="cut bg-white p-6">
              <h2 className="font-semiwide text-lg font-extrabold text-navy-950">Study resources</h2>
              <ul className="mt-3 grid gap-2.5 text-[15px]">
                {event.guide && <li><External href={event.guide} className={btn.link}>Official 2026–27 guidelines</External></li>}
                {study && <li><External href={study.url} className={btn.link}>{STUDY_LABEL[study.kind]}</External> <span className="text-ink-2">from the CE team</span></li>}
                <li><External href={CONNECT_URL} className={btn.link}>Official sample questions</External> <span className="text-ink-2">in FBLA Connect</span></li>
                <li><External href={mainSite.competitions(event.name)} className={btn.link}>This event on the chapter site</External></li>
              </ul>
              <p className="mt-4 text-[14px] text-ink-2">Each topic below also has an AI study guide.</p>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {modes.map((m) => (
              <div key={m.mode} className="cut flex flex-col bg-white p-6">
                <h2 className="font-semiwide text-lg font-extrabold text-navy-950">{m.title}</h2>
                <p className="mt-2 flex-1 text-[15px] text-ink-2">{m.body}</p>
                {m.note && <p className="mt-3 text-[14px] font-semibold text-navy-700">{m.note}</p>}
                <button className={`${btn.navy} mt-5`} disabled={!!starting || m.disabled} onClick={() => start(m.mode)}>
                  {starting === m.mode ? 'Starting…' : 'Start'}
                </button>
              </div>
            ))}
          </section>

          <section className="mt-12">
            <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Topics</h2>
            <p className="mt-1 text-ink-2">The knowledge areas FBLA lists for this test. Read the study guide, then drill the topic at your level.</p>
            <div className="cut mt-4 divide-y divide-line bg-white">
              {event.topics.map((t) => {
                const m = topicMastery(data.mastery, event.id, t.name);
                return (
                  <div key={t.name} className="grid items-center gap-3 px-5 py-4 md:grid-cols-[1fr_200px_auto]">
                    <div>
                      <div className="font-bold text-navy-950">{t.name}</div>
                      <div className="text-[13px] text-ink-2">{t.items ? `${t.items} questions on the real test, ` : t.weight ? `${t.weight}% of the test, ` : ''}{plural(event.bankByTopic[t.name] || 0, 'practice question')} written</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Bar pct={m.pct} />
                      <span className="w-24 text-right text-[13px] font-bold text-ink-2">{m.pct === null ? 'Not tried' : `${m.pct}% of ${m.attempts}`}</span>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/study/${event.id}/${encodeURIComponent(t.name)}`} className={btn.quiet}>Study</Link>
                      <button className={btn.quiet} disabled={!!starting} onClick={() => start('drill', t.name)}>
                        {starting === 'drill' + t.name ? 'Starting…' : `Drill (${lv})`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
