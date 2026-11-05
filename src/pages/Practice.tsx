import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useData } from '../lib/data';
import { api, errorText } from '../lib/api';
import { mainSite } from '../lib/config';
import { eventMastery, LEVEL_LABEL, LEVELS, plural, savedLevel, saveLevel, topicMastery } from '../lib/format';
import { CONNECT_URL, STUDY_LABEL, STUDY_LINKS } from '../data/studyLinks';
import { guidesFor } from '../data/guides';
import { Bar, btn, card, External, Icon, Loading, Notice, PageHead, SearchBox, Section } from '../components/Layout';
import { ActionCard, RowSections, ScorePip, StudySources } from '../components/Bits';
import type { Level, Mode, StartRes } from '../types';

export const SESSION_KEY = 'fblaprep.session';

/** Starts a practice session and saves it so the session page (and a reload) can pick it up. */
export async function beginSession(eventId: string, mode: Mode, level: Level, topic?: string): Promise<StartRes> {
  const res = await api.start(eventId, mode, level, topic);
  if (!res.questions.length) throw new Error('There aren’t any questions for this yet. Try again in a few minutes.');
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ start: res, answers: {}, checked: {}, review: [], index: 0, startedAt: Date.now() }));
  return res;
}

/** The practice in progress on this device, if any. */
export function savedSession(): { eventId: string; mode: Mode; index: number; total: number } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as { start: StartRes; index: number } | null;
    return s ? { eventId: s.start.eventId, mode: s.start.mode, index: s.index, total: s.start.questions.length } : null;
  } catch { return null; }
}

const ORDER = ['Objective tests', '9th & 10th grade tests', 'Role play tests', 'Presentation events with a test'];
const rank = (g: string) => (ORDER.indexOf(g) < 0 ? 99 : ORDER.indexOf(g));

export function EventList() {
  const { data, loading, error } = useData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  if (loading && !data) return <Loading label="Loading tests…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = [...new Set(data.events.map((e) => e.category || 'Other'))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const list = data.events.filter((e) => (!group || (e.category || 'Other') === group) && words.every((w) => `${e.name} ${e.category}`.toLowerCase().includes(w)));
  const groups = all.filter((g) => list.some((e) => (e.category || 'Other') === g));

  return (
    <div className="animate-rise">
      <PageHead
        title="Tests"
        sub={<>Not sure which event? Try the <External href={mainSite.eventFinder} className={btn.link}>Event Finder</External>.</>}
        right={<SearchBox value={q} onChange={setQ} label="Search tests" />}
      />
      {all.length > 1 && (
        <div className="-mt-3 mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter tests">
          {['', ...all].map((g) => (
            <button key={g || 'all'} onClick={() => setGroup(g)} aria-pressed={group === g}
              className={`cut-sm px-3.5 py-2 text-[13px] font-bold transition ${group === g ? 'bg-navy-900 text-white' : 'bg-white text-ink-2 hover:text-navy-950'}`}>
              {g || 'All'}
            </button>
          ))}
        </div>
      )}
      {data.events.length === 0 && <Notice>No tests yet. An officer can load them from Admin.</Notice>}
      {data.events.length > 0 && list.length === 0 && <p className="text-ink-2">No tests match “{q}”.</p>}
      <RowSections sections={groups.map((g) => ({
        title: g,
        rows: list.filter((e) => (e.category || 'Other') === g).map((e) => {
          const m = eventMastery(data.mastery, e.id);
          const best = LEVELS.map((l) => data.bests.find((b) => b.eventId === e.id && b.level === l.id)).filter(Boolean).pop();
          return {
            key: e.id, to: `/practice/${e.id}`, name: e.name, dim: !e.topics.length,
            meta: !e.topics.length ? 'Topics loading' : best ? `${best.level.toUpperCase()} test best ${best.best}%` : m.attempts ? `${plural(m.attempts, 'question')} answered` : plural(e.topics.length, 'topic'),
            right: <ScorePip pct={m.pct} />,
          };
        }),
      }))} />
    </div>
  );
}

function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  const current = LEVELS.find((l) => l.id === value) || LEVELS[0];
  return (
    <div>
      <div role="radiogroup" aria-label="Practice level" className="cut-sm inline-flex bg-white p-1">
        {LEVELS.map((l) => {
          const on = value === l.id;
          return (
            <button key={l.id} role="radio" aria-checked={on} onClick={() => onChange(l.id)}
              className={`cut-sm px-4 py-2 text-left transition ${on ? 'bg-navy-900 text-white' : 'text-ink-2 hover:text-navy-950'}`}>
              <span className={`font-wide text-[15px] font-black ${on ? 'text-gold' : ''}`}>{l.label}</span>
              <span className={`ml-1.5 text-[12px] font-bold ${on ? 'text-navy-100' : 'text-ink-3'}`}>{l.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">{current.desc}</p>
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
  const inProgress = savedSession();
  const resume = inProgress && inProgress.eventId === eventId ? inProgress : null;

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
    if (event && !auto.current && (go === 'weak' || go === 'drill' || go === 'review')) {
      auto.current = true;
      if (go === 'weak' && !practiced) return;
      if (go === 'review' && !missed) return;
      void start(go);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;
  if (!event) return <Notice tone="bad">That event isn’t available. <Link to="/practice" className={btn.link}>See all tests</Link></Notice>;

  const ready = event.topics.length > 0;
  const study = STUDY_LINKS[event.name];
  const bests = data.bests.filter((b) => b.eventId === event.id);
  const lv = LEVEL_LABEL[level];
  const best = bests.find((b) => b.level === level);
  const startBtn = (mode: Mode, label: string, cls = btn.navy) => (
    <button className={cls} disabled={!!starting} onClick={() => void start(mode)}>
      {starting === mode ? 'Starting…' : label}{starting !== mode && <Icon name="arrow" className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="animate-rise">
      <PageHead
        title={event.name}
        eyebrow={event.category || 'Test'}
        back={{ to: '/practice', label: 'Tests' }}
        sub={ready ? <>{plural(event.topics.length, 'topic')} · {plural(event.bank, 'question')} ready{event.guide ? <> · <External href={event.guide} className={btn.link}>2026–27 guidelines</External></> : null}</> : undefined}
        right={ready ? <LevelPicker value={level} onChange={pickLevel} /> : undefined}
      />

      {!ready && <Notice>Topics are still loading from the guidelines. Check back in a few minutes.</Notice>}
      {resume && (
        <div className="mb-5"><Notice tone="gold">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>You have a practice in progress, question {resume.index + 1} of {resume.total}.</span>
            <Link to="/session" className={btn.navy}>Resume</Link>
          </span>
        </Notice></div>
      )}
      {startError && <div className="mb-5"><Notice tone="bad">{startError}</Notice></div>}
      {starting && <div className="mb-5"><Notice tone="gold">Getting your questions ready. New ones can take up to 30 seconds.</Notice></div>}

      {ready && (
        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <ActionCard primary title="Quick drill" line={`10 ${lv} questions, checked as you go.`} action={startBtn('drill', 'Start', btn.gold)} />
              <ActionCard
                title={`Full ${lv} test`}
                line={event.bank >= 100 ? '100 questions in 50 minutes, split like the real test.' : `${Math.min(100, event.bank)} questions so far, timed to match the real test.`}
                extra={best ? <span className="cut-sm bg-navy-50 px-2 py-0.5 text-[12px] font-bold text-navy-900">Best {best.best}%</span> : undefined}
                disabled={event.bank < 10} note="Still writing questions. Try a drill first."
                action={startBtn('full', 'Start test')}
              />
              <ActionCard title="Weak spots" line={`10 ${lv} questions from the topics you miss most.`} disabled={!practiced} note="Do a quick drill first." action={startBtn('weak', 'Start')} />
              <ActionCard title="Mistakes" line="Questions you got wrong, until you get them right." disabled={!missed} note="Nothing to review yet."
                extra={missed ? <span className="cut-sm bg-bad-100 px-2 py-0.5 text-[12px] font-bold text-bad">{missed}</span> : undefined}
                action={startBtn('review', 'Review')} />
            </div>

            <Section title="Topics" count={event.topics.length} className="mt-10">
              <ul className="grid gap-2">
                {event.topics.map((t) => {
                  const m = topicMastery(data.mastery, event.id, t.name);
                  return (
                    <li key={t.name} className="cut-sm grid items-center gap-x-5 gap-y-2 bg-white px-4 py-3 md:grid-cols-[1fr_180px_auto]">
                      <div className="min-w-0">
                        <div className="text-[15px] font-bold text-navy-950">{t.name}</div>
                        <div className="text-[13px] text-ink-2">{t.items ? `${t.items} of 100 on the test` : t.weight ? `${t.weight}% of the test` : ''}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Bar pct={m.pct} />
                        <span className="w-16 shrink-0 text-right text-[12px] font-bold text-ink-2">{m.pct === null ? 'Not tried' : `${m.pct}%`}</span>
                      </div>
                      <div className="flex gap-2">
                        <Link to={`/study/${event.id}/${encodeURIComponent(t.name)}`} className={btn.quiet}><Icon name="book" className="h-4 w-4" />Study</Link>
                        <button className={btn.quiet} disabled={!!starting} onClick={() => void start('drill', t.name)}>
                          {starting === 'drill' + t.name ? 'Starting…' : 'Drill'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={`${card} p-5`}>
              <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">Study</h2>
              <div className="mt-4">
                <StudySources
                  guides={guidesFor(event.name)}
                  chapter={study ? { label: STUDY_LABEL[study.kind], url: study.url } : null}
                  official={[
                    ...(event.guide ? [{ label: '2026–27 guidelines', url: event.guide }] : []),
                    { label: 'Sample questions (FBLA Connect)', url: CONNECT_URL },
                    { label: 'Chapter site page', url: mainSite.competitions(event.name) },
                  ]}
                />
              </div>
            </div>
            {bests.length > 0 && (
              <div className={`${card} mt-3 p-5`}>
                <h2 className="font-semiwide text-[15px] font-extrabold text-navy-950">Full test scores</h2>
                <ul className="mt-2 grid gap-1.5 text-[14px]">
                  {LEVELS.filter((l) => bests.some((b) => b.level === l.id)).map((l) => {
                    const b = bests.find((x) => x.level === l.id)!;
                    return <li key={l.id} className="flex justify-between"><b className="text-navy-950">{l.label}</b><span className="text-ink-2">best {b.best}%, last {b.last}%</span></li>;
                  })}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
