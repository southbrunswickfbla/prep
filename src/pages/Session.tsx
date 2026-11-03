import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { clock, LETTERS, LEVEL_LABEL, MODE_LABEL, plural } from '../lib/format';
import { btn, Notice } from '../components/Layout';
import { SESSION_KEY } from './Practice';
import type { Question, StartRes } from '../types';

type Saved = {
  start: StartRes;
  answers: Record<string, number>;
  checked: Record<string, boolean>;
  review: string[];
  index: number;
  startedAt: number;
};

function loadSaved(): Saved | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as Saved | null; } catch { return null; }
}

const REASONS = [
  'The answer marked correct is wrong',
  'More than one answer is right',
  'The question is confusing',
  'It isn’t about this event',
  'Something else',
];

function Report({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  useEffect(() => { setOpen(false); setState('idle'); }, [q.id]);
  if (state === 'sent') return <p className="text-[14px] font-semibold text-good">Thanks. Officers will review this question.</p>;
  if (!open) return <button className="text-[14px] font-bold text-ink-3 hover:text-navy-950" onClick={() => setOpen(true)}>Report a problem with this question</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="cut-sm bg-paper px-3 py-2 text-[14px] font-semibold" aria-label="What’s wrong">
        {REASONS.map((r) => <option key={r}>{r}</option>)}
      </select>
      <button className={btn.quiet} disabled={state === 'sending'} onClick={async () => {
        setState('sending');
        try { await api.flag(q.id, reason); setState('sent'); } catch { setState('error'); }
      }}>{state === 'sending' ? 'Sending…' : 'Send report'}</button>
      <button className="text-[14px] font-bold text-ink-3" onClick={() => setOpen(false)}>Cancel</button>
      {state === 'error' && <span className="text-[14px] font-semibold text-bad">Couldn’t send. Try again.</span>}
    </div>
  );
}

export function Session() {
  const navigate = useNavigate();
  const { refresh } = useData();
  const [s, setS] = useState<Saved | null>(loadSaved);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const submittedRef = useRef(false);

  const update = useCallback((fn: (prev: Saved) => Saved) => {
    setS((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const submit = useCallback(async () => {
    if (!s || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true); setError(''); setConfirming(false);
    try {
      const seconds = Math.round((Date.now() - s.startedAt) / 1000);
      const res = await api.submit(s.start.sessionId, s.answers, seconds);
      try { sessionStorage.setItem('fblaprep.results.' + res.sessionId, JSON.stringify(res)); } catch { /* ignore */ }
      sessionStorage.removeItem(SESSION_KEY);
      void refresh();
      navigate(`/results/${res.sessionId}`, { replace: true });
    } catch (e) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(errorText(e) + ' Your answers are still saved on this device.');
    }
  }, [s, navigate, refresh]);

  const isFull = s?.start.mode === 'full';
  const elapsed = s ? (now - s.startedAt) / 1000 : 0;
  const remaining = s && s.start.timeLimit ? s.start.timeLimit - elapsed : null;

  // Time's up on a full test: submit what's there.
  useEffect(() => { if (isFull && remaining !== null && remaining <= 0 && !submittedRef.current) void submit(); }, [isFull, remaining, submit]);

  const q = s ? s.start.questions[s.index] : undefined;
  const chosen = q && s ? s.answers[q.id] : undefined;
  const checked = !!(q && s?.checked[q.id]);
  const last = s ? s.index === s.start.questions.length - 1 : false;

  const choose = useCallback((i: number) => {
    if (!q || submitting) return;
    update((p) => (p.checked[q.id] ? p : { ...p, answers: { ...p.answers, [q.id]: i } }));
  }, [q, submitting, update]);

  const check = useCallback(() => {
    if (!q || chosen === undefined) return;
    update((p) => ({ ...p, checked: { ...p.checked, [q.id]: true } }));
  }, [q, chosen, update]);

  const go = useCallback((i: number) => {
    update((p) => ({ ...p, index: Math.max(0, Math.min(p.start.questions.length - 1, i)) }));
    window.scrollTo({ top: 0 });
  }, [update]);

  // Keyboard: 1–4 or A–D to choose, Enter to check or move on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!s || !q || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? Number(k) - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
      if (idx >= 0 && idx < q.choices.length) { e.preventDefault(); choose(idx); return; }
      if (e.key === 'Enter') {
        if (t.tagName === 'BUTTON') return;
        e.preventDefault();
        if (isFull) { if (!last) go(s.index + 1); }
        else if (!checked) check();
        else if (last) void submit();
        else go(s.index + 1);
      }
      if (isFull && e.key === 'ArrowRight' && !last) go(s.index + 1);
      if (isFull && e.key === 'ArrowLeft' && s.index > 0) go(s.index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, q, isFull, last, checked, choose, check, go, submit]);

  if (!s || !q) {
    return (
      <div className="py-16">
        <h1 className="font-wide text-3xl font-black text-navy-950">No practice in progress</h1>
        <p className="mt-3 text-ink-2">Pick an event to start a drill or a practice test.</p>
        <Link to="/practice" className={`${btn.navy} mt-6`}>Pick an event</Link>
      </div>
    );
  }

  const total = s.start.questions.length;
  const answered = s.start.questions.filter((x) => s.answers[x.id] !== undefined).length;
  const right = s.start.questions.filter((x) => s.checked[x.id] && s.answers[x.id] === x.answer).length;
  const checkedCount = Object.keys(s.checked).length;
  const flaggedForReview = s.review.includes(q.id);
  const lowTime = remaining !== null && remaining < 300;

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semiwide text-[15px] font-extrabold text-navy-950">{s.start.eventName}</div>
          <div className="text-[14px] text-ink-2">{MODE_LABEL[s.start.mode]}{s.start.mode !== 'review' && s.start.level ? `, ${LEVEL_LABEL[s.start.level]} level` : ''}</div>
        </div>
        <div className="flex items-center gap-3">
          {!isFull && checkedCount > 0 && <span className="cut-sm bg-good-100 px-3 py-1.5 text-[14px] font-bold text-good">{right} of {checkedCount} right</span>}
          <span
            className={`cut-sm px-3 py-1.5 font-wide text-[18px] font-black tabular-nums ${lowTime ? 'bg-bad text-white' : 'bg-navy-900 text-gold'}`}
            aria-label={remaining !== null ? 'Time left' : 'Time spent'}
          >
            {remaining !== null ? clock(remaining) : clock(elapsed)}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 bg-navy-100"><div className="h-full bg-gold transition-[width]" style={{ width: `${((s.index + 1) / total) * 100}%` }} /></div>
        <span className="text-[14px] font-bold text-ink-2">{s.index + 1} of {total}</span>
      </div>

      {s.start.generated > 0 && s.index === 0 && !checked && (
        <p className="mt-4 text-[14px] text-ink-2">The AI wrote {plural(s.start.generated, 'new question')} for this session.</p>
      )}

      <article className="cut mt-5 bg-white p-6 sm:p-8">
        <div className="text-[13px] font-bold text-blue">{q.topic}</div>
        <h1 className="mt-2 font-semiwide text-[clamp(19px,2.6vw,23px)] font-bold leading-snug text-navy-950">{q.stem}</h1>
        <div className="mt-6 grid gap-2.5" role="radiogroup" aria-label="Answer choices">
          {q.choices.map((c, i) => {
            const picked = chosen === i;
            const isAnswer = checked && i === q.answer;
            const isWrongPick = checked && picked && i !== q.answer;
            const tone = isAnswer ? 'bg-good-100 inset-ring-2 inset-ring-good' : isWrongPick ? 'bg-bad-100 inset-ring-2 inset-ring-bad' : picked ? 'bg-navy-100 inset-ring-2 inset-ring-navy-900' : 'bg-paper hover:bg-navy-100/60';
            return (
              <button
                key={i} role="radio" aria-checked={picked} disabled={checked || submitting}
                onClick={() => choose(i)}
                className={`cut-sm flex items-start gap-4 px-4 py-3.5 text-left text-[16px] transition ${tone} disabled:cursor-default`}
              >
                <span className={`cut-sm grid h-8 w-8 shrink-0 place-items-center font-wide text-[14px] font-black ${isAnswer ? 'bg-good text-white' : isWrongPick ? 'bg-bad text-white' : picked ? 'bg-navy-900 text-gold' : 'bg-white text-navy-900'}`}>{LETTERS[i]}</span>
                <span className="pt-1 font-medium text-ink">{c}</span>
              </button>
            );
          })}
        </div>

        {checked && (
          <div className={`cut-sm mt-6 p-4 ${chosen === q.answer ? 'bg-good-100' : 'bg-bad-100'}`} role="status">
            <div className={`font-semiwide font-extrabold ${chosen === q.answer ? 'text-good' : 'text-bad'}`}>
              {chosen === q.answer ? 'Correct.' : `Not quite. The answer is ${LETTERS[q.answer ?? 0]}.`}
            </div>
            {q.explanation && <p className="mt-1.5 text-[15px] text-ink">{q.explanation}</p>}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isFull ? (
            <>
              <button className={btn.quiet} disabled={s.index === 0} onClick={() => go(s.index - 1)}>Previous</button>
              {!last && <button className={btn.navy} onClick={() => go(s.index + 1)}>Next</button>}
              <button
                className={`text-[14px] font-bold ${flaggedForReview ? 'text-navy-950' : 'text-ink-3 hover:text-navy-950'}`}
                onClick={() => update((p) => ({ ...p, review: flaggedForReview ? p.review.filter((x) => x !== q.id) : [...p.review, q.id] }))}
              >
                {flaggedForReview ? 'Marked for review' : 'Mark for review'}
              </button>
            </>
          ) : !checked ? (
            <button className={btn.navy} disabled={chosen === undefined} onClick={check}>Check answer</button>
          ) : last ? (
            <button className={btn.gold} disabled={submitting} onClick={() => void submit()}>{submitting ? 'Saving…' : 'See results'}</button>
          ) : (
            <button className={btn.navy} onClick={() => go(s.index + 1)}>Next question</button>
          )}
        </div>
      </article>

      <div className="mt-4"><Report q={q} /></div>

      {isFull && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] font-bold text-ink-2">{answered} of {total} answered{s.review.length ? `, ${s.review.length} marked for review` : ''}</p>
            {!confirming
              ? <button className={btn.gold} disabled={submitting} onClick={() => (answered < total ? setConfirming(true) : void submit())}>{submitting ? 'Grading…' : 'Submit test'}</button>
              : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-bad">{plural(total - answered, 'question')} unanswered.</span>
                  <button className={btn.gold} onClick={() => void submit()}>Submit anyway</button>
                  <button className={btn.quiet} onClick={() => setConfirming(false)}>Keep going</button>
                </div>
              )}
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5" aria-label="Jump to a question">
            {s.start.questions.map((x, i) => {
              const done = s.answers[x.id] !== undefined;
              const rev = s.review.includes(x.id);
              return (
                <button
                  key={x.id} onClick={() => go(i)} aria-label={`Question ${i + 1}${done ? ', answered' : ''}${rev ? ', marked for review' : ''}`}
                  className={`cut-sm h-10 text-[13px] font-black ${i === s.index ? 'inset-ring-[3px] inset-ring-blue' : ''} ${rev ? 'bg-gold text-navy-950' : done ? 'bg-navy-900 text-white' : 'bg-white text-ink-2'}`}
                >{i + 1}</button>
              );
            })}
          </div>
        </section>
      )}

      {error && <div className="mt-6"><Notice tone="bad">{error}</Notice></div>}
      {!isFull && <p className="mt-8 text-[13px] text-ink-3">Tip: press 1–4 to answer and Enter to check.</p>}
      {isFull && <p className="mt-8 text-[13px] text-ink-3">Tip: press 1–4 to answer and the arrow keys to move between questions.</p>}
    </div>
  );
}
