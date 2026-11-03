import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { clock, eventMastery, LETTERS, LEVEL_LABEL, MODE_LABEL, plural, savedLevel, shortDate, topicMastery } from '../lib/format';
import { Bar, btn, Loading, Notice, PageHead } from '../components/Layout';
import { beginSession } from './Practice';
import type { Results as ResultsT } from '../types';

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

  const weakest = [...res.byTopic].sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  const missed = res.review.filter((r) => !r.correct);
  const items = show === 'missed' ? missed : res.review;

  async function drill(topic?: string) {
    setStarting(true);
    try {
      await beginSession(res!.eventId, topic ? 'drill' : 'weak', res!.level || savedLevel(res!.eventId), topic);
      navigate('/session');
    } catch (e) { setError(errorText(e)); setStarting(false); }
  }

  const lvl = res.level ? LEVEL_LABEL[res.level] : 'RCE';
  const next = res.level === 'rce' ? 'SLC' : res.level === 'slc' ? 'NLC' : '';
  const verdict = res.mode === 'review'
    ? (res.pct === 100 ? 'All fixed.' : 'Getting there.')
    : res.pct >= 90 ? (next ? `${lvl}-ready. Try ${next} next.` : 'National-level ready.') : res.pct >= 75 ? 'Strong. Keep sharpening.' : res.pct >= 60 ? 'Getting there.' : 'Keep drilling.';

  return (
    <div className="animate-rise">
      <section className="ledger cut-lg grid gap-8 px-6 py-10 pl-[84px] text-white sm:px-10 sm:pl-[96px] md:grid-cols-[auto_1fr] md:items-end">
        <div className="font-wide text-[clamp(88px,16vw,168px)] font-black leading-[0.8] tracking-tight text-gold">{res.pct}%</div>
        <div>
          <p className="font-semiwide text-[15px] font-extrabold text-navy-200">{res.eventName}, {MODE_LABEL[res.mode].toLowerCase()}{res.mode !== 'review' && res.level ? `, ${LEVEL_LABEL[res.level]} level` : ''}</p>
          <h1 className="mt-2 font-wide text-[clamp(28px,4vw,42px)] font-black leading-none">{verdict}</h1>
          <p className="mt-3 text-[17px] text-navy-100">{res.correct} of {res.total} correct in {clock(res.seconds)}.</p>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        {weakest && weakest.correct < weakest.total && (
          <button className={btn.gold} disabled={starting} onClick={() => drill(weakest.topic)}>{starting ? 'Starting…' : `Drill ${weakest.topic}`}</button>
        )}
        <button className={btn.navy} disabled={starting} onClick={() => drill()}>Weak-spot drill</button>
        {missed.length > 0 && <Link to={`/practice/${res.eventId}?go=review`} className={btn.quiet}>Review my mistakes</Link>}
        <Link to={`/practice/${res.eventId}`} className={btn.quiet}>Back to {res.eventName}</Link>
      </div>

      <section className="mt-12">
        <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">By topic</h2>
        <div className="cut mt-4 divide-y divide-line bg-white">
          {[...res.byTopic].sort((a, b) => a.correct / a.total - b.correct / b.total).map((t) => {
            const pct = Math.round((t.correct / t.total) * 100);
            return (
              <div key={t.topic} className="grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_240px_70px]">
                <span className="font-bold text-navy-950">{t.topic}</span>
                <Bar pct={pct} />
                <span className="text-right text-[14px] font-bold text-ink-2">{t.correct}/{t.total}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Review</h2>
          <div className="flex gap-1">
            {(['missed', 'all'] as const).map((k) => (
              <button key={k} onClick={() => setShow(k)} aria-pressed={show === k}
                className={`cut-sm px-4 py-2 text-[14px] font-bold ${show === k ? 'bg-navy-900 text-white' : 'bg-white text-ink-2'}`}>
                {k === 'missed' ? `Missed (${missed.length})` : `All (${res.review.length})`}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 && <p className="mt-4 text-ink-2">You didn’t miss any. Try a full practice test next.</p>}
        <ol className="mt-4 grid gap-4">
          {items.map((r) => (
            <li key={r.id} className="cut bg-white p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-blue">Question {res.review.indexOf(r) + 1}, {r.topic}</span>
                <span className={`text-[13px] font-black ${r.correct ? 'text-good' : 'text-bad'}`}>{r.correct ? 'Correct' : r.chosen === null ? 'Skipped' : 'Missed'}</span>
              </div>
              <p className="mt-2 font-semiwide text-[17px] font-bold text-navy-950">{r.stem}</p>
              <ul className="mt-3 grid gap-1.5">
                {r.choices.map((c, i) => (
                  <li key={i} className={`cut-sm flex gap-3 px-3 py-2 text-[15px] ${i === r.answer ? 'bg-good-100 font-semibold' : i === r.chosen ? 'bg-bad-100' : ''}`}>
                    <b className="w-4">{LETTERS[i]}</b>
                    <span>{c}{i === r.chosen && i !== r.answer ? ' (your answer)' : ''}{i === r.answer && i === r.chosen ? ' (your answer)' : ''}</span>
                  </li>
                ))}
              </ul>
              {r.explanation && <p className="mt-3 text-[15px] text-ink-2">{r.explanation}</p>}
            </li>
          ))}
        </ol>
      </section>
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
      <PageHead title="Your progress" sub="Percent correct by topic, across every drill and practice test you’ve finished." />
      {practiced.length === 0 && (
        <div className="cut bg-white p-6">
          <p className="text-ink-2">Nothing yet. Finish a drill and your topics show up here.</p>
          <Link to="/practice" className={`${btn.navy} mt-5`}>Pick an event</Link>
        </div>
      )}
      <div className="grid gap-6">
        {practiced.map((e) => {
          const m = eventMastery(data.mastery, e.id);
          return (
            <section key={e.id} className="cut bg-white p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <Link to={`/practice/${e.id}`} className="font-semiwide text-xl font-extrabold text-navy-950 hover:text-blue">{e.name}</Link>
                <span className="font-wide text-2xl font-black text-navy-950">{m.pct}%</span>
              </div>
              <p className="text-[14px] text-ink-2">{plural(m.attempts, 'question')} answered</p>
              {data.bests.some((b) => b.eventId === e.id) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['rce', 'slc', 'nlc'] as const).map((l) => {
                    const b = data.bests.find((x) => x.eventId === e.id && x.level === l);
                    return (
                      <span key={l} className={`cut-sm px-3 py-1.5 text-[13px] font-bold ${b ? 'bg-navy-900 text-white' : 'bg-navy-100 text-ink-3'}`}>
                        {LEVEL_LABEL[l]} test: {b ? `best ${b.best}%, ${plural(b.count, 'try', 'tries')}` : 'not taken'}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 grid gap-3">
                {e.topics.map((t) => {
                  const tm = topicMastery(data.mastery, e.id, t.name);
                  return (
                    <div key={t.name} className="grid items-center gap-2 sm:grid-cols-[1fr_260px_90px]">
                      <span className="text-[15px] font-semibold">{t.name}</span>
                      <Bar pct={tm.pct} />
                      <span className="text-right text-[13px] font-bold text-ink-2">{tm.pct === null ? 'Not tried' : `${tm.pct}%`}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {data.recent.length > 0 && (
        <section className="mt-12">
          <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse bg-white text-left text-[15px]">
              <thead><tr className="bg-navy-900 text-white">
                <th className="px-4 py-3 font-bold">Date</th><th className="px-4 py-3 font-bold">Event</th><th className="px-4 py-3 font-bold">Type</th><th className="px-4 py-3 text-right font-bold">Score</th>
              </tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="px-4 py-3">{shortDate(r.submitted)}</td>
                    <td className="px-4 py-3"><Link to={`/results/${r.id}`} className="font-bold text-navy-950 hover:text-blue">{r.eventName}</Link></td>
                    <td className="px-4 py-3 text-ink-2">{MODE_LABEL[r.mode]}{r.mode !== 'review' && r.level ? ` (${LEVEL_LABEL[r.level]})` : ''}</td>
                    <td className="px-4 py-3 text-right font-black">{r.correct}/{r.total} ({r.pct}%)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
