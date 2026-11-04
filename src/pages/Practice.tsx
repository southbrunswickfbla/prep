import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useData } from '../lib/data';
import { api, errorText } from '../lib/api';
import { mainSite } from '../lib/config';
import { eventMastery, LEVEL_LABEL, LEVELS, plural, savedLevel, saveLevel, topicMastery } from '../lib/format';
import { CONNECT_URL, STUDY_LABEL, STUDY_LINKS } from '../data/studyLinks';
import { Bar, btn, External, Loading, Notice, PageHead } from '../components/Layout';
import { RowSections, ScorePip } from '../components/Bits';
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
  if (loading && !data) return <Loading label="Loading tests…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = data.events.filter((e) => words.every((w) => `${e.name} ${e.category}`.toLowerCase().includes(w)));
  const groups = [...new Set(list.map((e) => e.category || 'Other'))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return (
    <div>
      <PageHead
        title="Tests"
        sub={<>Not sure which event? Try the <External href={mainSite.eventFinder} className={btn.link}>Event Finder</External>.</>}
        right={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tests" aria-label="Search tests" className="cut-sm w-72 max-w-full border-0 bg-white px-4 py-3 text-[16px] outline-none inset-ring-1 inset-ring-line focus:inset-ring-2 focus:inset-ring-gold" />}
      />
      {data.events.length === 0 && <Notice>No tests yet. An officer can load them from Admin.</Notice>}
      {data.events.length > 0 && list.length === 0 && <p className="text-ink-2">No tests match “{q}”.</p>}
      <RowSections sections={groups.map((g) => ({
        title: g,
        rows: list.filter((e) => (e.category || 'Other') === g).map((e) => {
          const m = eventMastery(data.mastery, e.id);
          const best = LEVELS.map((l) => data.bests.find((b) => b.eventId === e.id && b.level === l.id)).filter(Boolean).pop();
          return {
            key: e.id, to: `/practice/${e.id}`, name: e.name, dim: !e.topics.length,
            meta: !e.topics.length ? 'Loading topics' : best ? `${best.level.toUpperCase()} test best ${best.best}%` : m.attempts ? `${plural(m.attempts, 'question')} answered` : `${plural(e.topics.length, 'topic')}`,
            right: <ScorePip pct={m.pct} />,
          };
        }),
      }))} />
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
    { mode: 'drill', title: 'Quick drill', body: `10 ${lv} questions, checked as you go.` },
    { mode: 'weak', title: 'Weak spots', body: `10 ${lv} questions from the topics you miss most.`, note: practiced ? undefined : 'Do a quick drill first.', disabled: !practiced },
    { mode: 'review', title: 'Mistakes', body: 'Questions you got wrong, until you get them right.', note: missed ? `${plural(missed, 'question')} waiting` : 'Nothing to review', disabled: !missed },
  ];

  return (
    <div className="animate-rise">
      <PageHead title={event.name} back={{ to: '/practice', label: 'Tests' }} />

      {!ready && <Notice>Topics are still loading. Check back in a few minutes.</Notice>}
      {startError && <div className="mb-6"><Notice tone="bad">{startError}</Notice></div>}
      {starting && <div className="mb-6"><Notice tone="gold">Getting your questions ready. New ones can take up to 30 seconds.</Notice></div>}

      {ready && (
        <>
          <section>
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
                {event.bank >= 100 ? '100 questions, 50 minutes' : `${Math.min(100, event.bank)} questions so far, timed to match`}, split like the real test.
              </p>
              <button className={`${btn.gold} mt-5 self-start`} disabled={!!starting || event.bank < 10} onClick={() => start('full')}>
                {starting === 'full' ? 'Starting…' : `Start the ${lv} test`}
              </button>
              {event.bank < 10 && <p className="mt-3 text-[14px] font-semibold text-gold-300">Still writing questions. Try a drill first.</p>}
            </div>

            <div className="cut bg-white p-6">
              <h2 className="font-semiwide text-lg font-extrabold text-navy-950">Study</h2>
              <ul className="mt-3 grid gap-2.5 text-[15px]">
                {event.guide && <li><External href={event.guide} className={btn.link}>2026–27 guidelines</External></li>}
                {study && <li><External href={study.url} className={btn.link}>{STUDY_LABEL[study.kind]}</External></li>}
                <li><External href={CONNECT_URL} className={btn.link}>Sample questions (FBLA Connect)</External></li>
                <li><External href={mainSite.competitions(event.name)} className={btn.link}>Chapter site page</External></li>
              </ul>
            </div>
          </section>

          <section className="mt-12">
            <div className="border-b-[3px] border-navy-900 pb-2"><h2 className="font-wide text-[19px] font-black text-navy-950">Drills</h2></div>
            <ul>
              {modes.map((m) => (
                <li key={m.mode} className="grid items-center gap-3 border-b border-line py-4 sm:grid-cols-[180px_1fr_auto]">
                  <span className="font-bold text-navy-950">{m.title}</span>
                  <span className="text-[15px] text-ink-2">{m.body}{m.note ? <span className="ml-2 font-semibold text-navy-700">{m.note}</span> : null}</span>
                  <button className={btn.navy} disabled={!!starting || m.disabled} onClick={() => start(m.mode)}>{starting === m.mode ? 'Starting…' : 'Start'}</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12">
            <div className="flex items-baseline justify-between border-b-[3px] border-navy-900 pb-2">
              <h2 className="font-wide text-[19px] font-black text-navy-950">Topics</h2>
              <span className="font-wide text-[15px] font-black tabular-nums text-ink-3">{event.topics.length}</span>
            </div>
            <div className="divide-y divide-line">
              {event.topics.map((t) => {
                const m = topicMastery(data.mastery, event.id, t.name);
                return (
                  <div key={t.name} className="grid items-center gap-3 py-4 md:grid-cols-[1fr_200px_auto]">
                    <div>
                      <div className="font-bold text-navy-950">{t.name}</div>
                      <div className="text-[13px] text-ink-2">{t.items ? `${t.items} of 100 on the real test` : t.weight ? `${t.weight}% of the test` : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Bar pct={m.pct} />
                      <span className="w-28 whitespace-nowrap text-right text-[13px] font-bold text-ink-2">{m.pct === null ? 'Not tried' : `${m.pct}% of ${m.attempts}`}</span>
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
