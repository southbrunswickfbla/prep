import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { clock, eventMastery, LETTERS, LEVEL_LABEL, MODE_LABEL, plural, savedLevel, shortDate, topicMastery } from '../lib/format';
import { Bar, btn, card, Eyebrow, Icon, Loading, Notice, PageHead, Section } from '../components/Layout';
import { ScorePip } from '../components/Bits';
import { beginSession } from './Practice';
import type { Results as ResultsT } from '../types';

export function verdictFor(pct: number): string {
  return pct >= 90 ? 'Excellent.' : pct >= 75 ? 'Strong.' : pct >= 60 ? 'Getting there.' : 'Keep practicing.';
}

/** The score band at the top of every results page. */
export function ScoreBand({ pct, eyebrow, title, line }: { pct: number; eyebrow: string; title: string; line: string }) {
  return (
    <section className="ledger cut-lg grid gap-x-10 gap-y-4 py-8 pl-[68px] pr-6 text-white sm:pl-[88px] sm:pr-10 md:grid-cols-[auto_1fr] md:items-center short:py-6">
      <div className="font-wide text-[clamp(72px,11vw,128px)] font-black leading-[0.82] tracking-tight text-gold tabular-nums">{pct}%</div>
      <div className="min-w-0">
        <Eyebrow light>{eyebrow}</Eyebrow>
        <h1 className="mt-2 font-wide text-[clamp(26px,3.4vw,38px)] font-black leading-none">{title}</h1>
        <p className="mt-2.5 text-[16px] text-navy-100">{line}</p>
      </div>
    </section>
  );
}

export function Results() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [res, setRes] = useState<ResultsT | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('fblaprep.results.' + sessionId) || 'null') as ResultsT | null; } catch { return null; }
  });
  const [error, setError] = useState('');
  const [show, setShow] = useState<'missed' | 'all'>('missed');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (res) return;
    api.results(sessionId).then(setRes).catch((e) => setError(errorText(e)));
  }, [sessionId, res]);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!res) return <Loading label="Loading results…" />;

  const byTopic = [...res.byTopic].sort((a, b) => a.correct / a.total - b.correct / b.total);
  const weakest = byTopic[0];
  const missed = res.review.filter((r) => !r.correct);
  const items = show === 'missed' ? missed : res.review;

  async function drill(topic?: string) {
    setStarting(true);
    try {
      await beginSession(res!.eventId, topic ? 'drill' : 'weak', res!.level || savedLevel(res!.eventId), topic);
      navigate('/session');
    } catch (e) { setError(errorText(e)); setStarting(false); }
  }

  const title = res.mode === 'review' ? (res.pct === 100 ? 'All fixed.' : 'Getting there.') : verdictFor(res.pct);

  return (
    <div className="animate-rise">
      <ScoreBand
        pct={res.pct}
        eyebrow={`${res.eventName} · ${MODE_LABEL[res.mode]}${res.mode !== 'review' && res.level ? ` · ${LEVEL_LABEL[res.level]}` : ''}`}
        title={title}
        line={`${res.correct} of ${res.total} correct in ${clock(res.seconds)}.`}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {weakest && weakest.correct < weakest.total && (
          <button className={btn.gold} disabled={starting} onClick={() => void drill(weakest.topic)}>{starting ? 'Starting…' : `Drill ${weakest.topic}`}</button>
        )}
        <button className={btn.navy} disabled={starting} onClick={() => void drill()}>Weak-spot drill</button>
        {missed.length > 0 && <Link to={`/practice/${res.eventId}?go=review`} className={btn.quiet}>Review my mistakes</Link>}
        <Link to={`/practice/${res.eventId}`} className={btn.quiet}>Back to {res.eventName}</Link>
      </div>

      <Section title="By topic" className="mt-10">
        <ul className={`${card} divide-y divide-line`}>
          {byTopic.map((t) => {
            const pct = Math.round((t.correct / t.total) * 100);
            return (
              <li key={t.topic} className="grid items-center gap-x-5 gap-y-2 px-5 py-3.5 sm:grid-cols-[1fr_220px_56px]">
                <span className="text-[15px] font-bold text-navy-950">{t.topic}</span>
                <Bar pct={pct} />
                <span className="text-right text-[13px] font-bold tabular-nums text-ink-2">{t.correct}/{t.total}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Review"
        className="mt-10"
        right={
          <div className="flex gap-1">
            {(['missed', 'all'] as const).map((k) => (
              <button key={k} onClick={() => setShow(k)} aria-pressed={show === k}
                className={`cut-sm px-3 py-1.5 text-[13px] font-bold ${show === k ? 'bg-navy-900 text-white' : 'bg-white text-ink-2'}`}>
                {k === 'missed' ? `Missed (${missed.length})` : `All (${res.review.length})`}
              </button>
            ))}
          </div>
        }
      >
        {items.length === 0 && <p className="py-2 text-ink-2">None missed.</p>}
        <ol className="grid gap-3">
          {items.map((r) => (
            <li key={r.id} className={`${card} p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-blue">Question {res.review.indexOf(r) + 1} · {r.topic}</span>
                <span className={`text-[13px] font-black ${r.correct ? 'text-good' : 'text-bad'}`}>{r.correct ? 'Correct' : r.chosen === null ? 'Skipped' : 'Missed'}</span>
              </div>
              <p className="mt-2 font-semiwide text-[16px] font-bold leading-snug text-navy-950">{r.stem}</p>
              <ul className="mt-3 grid gap-1.5">
                {r.choices.map((c, i) => (
                  <li key={i} className={`cut-sm flex gap-3 px-3 py-2 text-[15px] ${i === r.answer ? 'bg-good-100 font-semibold' : i === r.chosen ? 'bg-bad-100' : 'bg-navy-50'}`}>
                    <b className="w-4 shrink-0">{LETTERS[i]}</b>
                    <span>{c}{i === r.chosen ? ' (your answer)' : ''}</span>
                  </li>
                ))}
              </ul>
              {r.explanation && <p className="mt-3 text-[15px] text-ink-2">{r.explanation}</p>}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

export function Progress() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loading />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;
  const practiced = data.events.filter((e) => eventMastery(data.mastery, e.id).attempts > 0);

  return (
    <div className="animate-rise">
      <PageHead title="Progress" sub="Percent correct by topic." />
      {practiced.length === 0 && (
        <div className={`${card} p-6`}>
          <p className="text-ink-2">Finish a drill to see your topics here.</p>
          <Link to="/practice" className={`${btn.navy} mt-4`}>Pick a test<Icon name="arrow" className="h-4 w-4" /></Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {practiced.map((e) => {
          const m = eventMastery(data.mastery, e.id);
          return (
            <section key={e.id} className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/practice/${e.id}`} className="font-semiwide text-[17px] font-extrabold text-navy-950 hover:text-blue">{e.name}</Link>
                  <p className="text-[13px] text-ink-2">{plural(m.attempts, 'question')} answered</p>
                </div>
                <ScorePip pct={m.pct} />
              </div>
              {data.bests.some((b) => b.eventId === e.id) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(['rce', 'slc', 'nlc'] as const).map((l) => {
                    const b = data.bests.find((x) => x.eventId === e.id && x.level === l);
                    return (
                      <span key={l} className={`cut-sm px-2.5 py-1 text-[12px] font-bold ${b ? 'bg-navy-900 text-white' : 'bg-navy-50 text-ink-3'}`}>
                        {LEVEL_LABEL[l]} test: {b ? `best ${b.best}%` : 'not taken'}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 grid gap-2.5">
                {e.topics.map((t) => {
                  const tm = topicMastery(data.mastery, e.id, t.name);
                  return (
                    <div key={t.name} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_140px_44px]">
                      <span className="truncate text-[14px] font-semibold">{t.name}</span>
                      <Bar pct={tm.pct} />
                      <span className="text-right text-[12px] font-bold text-ink-2">{tm.pct === null ? '–' : `${tm.pct}%`}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {data.recent.length > 0 && (
        <Section title="History" className="mt-12">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse bg-white text-left text-[14px]">
              <thead><tr className="border-b-2 border-line text-ink-2">
                <th className="px-4 py-3 font-bold">Date</th><th className="px-4 py-3 font-bold">Event</th><th className="px-4 py-3 font-bold">Type</th><th className="px-4 py-3 text-right font-bold">Score</th>
              </tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-ink-2">{shortDate(r.submitted)}</td>
                    <td className="px-4 py-3"><Link to={`/results/${r.id}`} className="font-bold text-navy-950 hover:text-blue">{r.eventName}</Link></td>
                    <td className="px-4 py-3 text-ink-2">{MODE_LABEL[r.mode]}{r.mode !== 'review' && r.level ? ` (${LEVEL_LABEL[r.level]})` : ''}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{r.correct}/{r.total} ({r.pct}%)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
