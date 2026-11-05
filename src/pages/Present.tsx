import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../lib/api';
import { clock, plural, shortDate } from '../lib/format';
import { blobToBase64, recordingSupported, speak, stopSpeaking, useRecorder, type Recording } from '../lib/recorder';
import { guidesFor } from '../data/guides';
import { Bar, btn, card, Eyebrow, Icon, input, Loading, Notice, PageHead, SearchBox, Section, Spinner, useFocusMode } from '../components/Layout';
import { RowSections, ScorePip, StudySources } from '../components/Bits';
import { ScoreBand, verdictFor } from './Results';
import type { JudgeEvent, JudgeEventDetail, PresentResult, Scenario, Transcript } from '../types';

const ORDER = ['Role plays', 'Presentation events', 'Speaking and interview events', '9th & 10th grade presentations', 'Chapter events'];
const base = (kind: string) => (kind === 'roleplay' ? '/roleplay' : '/present');
const rank = (g: string) => (ORDER.indexOf(g) < 0 ? 99 : ORDER.indexOf(g));
const usesPrompt = (e: { name: string; prepMin: number }) => /impromptu|interview/i.test(e.name) || e.prepMin > 0;
const isInterview = (e: { name: string }) => /interview/i.test(e.name);
const minutes = (m: number) => (m === Math.floor(m) ? String(m) : m.toFixed(1));

function timing(e: { presentMin: number; qaMin: number; prepMin: number; name: string; kind?: string }) {
  if (!e.presentMin) return 'Time limits load from the guidelines';
  const parts = [];
  if (e.prepMin) parts.push(`${minutes(e.prepMin)} min to prepare`);
  if (e.kind === 'roleplay') parts.push(`up to ${minutes(e.presentMin)} min role play`);
  else {
    parts.push(`up to ${minutes(e.presentMin)} min ${isInterview(e) ? 'interview' : 'to present'}`);
    if (e.qaMin) parts.push(`${minutes(e.qaMin)} min of questions`);
  }
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ====================== Event list ====================== */

export function PresentList({ kind = 'presentation' }: { kind?: 'presentation' | 'roleplay' }) {
  const [events, setEvents] = useState<JudgeEvent[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { setEvents(null); api.present.events().then(setEvents).catch((e) => setError(errorText(e))); }, [kind]);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!events) return <Loading label={kind === 'roleplay' ? 'Loading role plays…' : 'Loading presentation events…'} />;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = events.filter((e) => (e.kind || 'presentation') === kind && words.every((w) => e.name.toLowerCase().includes(w)));
  const groups = [...new Set(list.map((e) => e.category || 'Presentation events'))].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="animate-rise">
      <PageHead
        title={kind === 'roleplay' ? 'Role plays' : 'Presentations'}
        sub={kind === 'roleplay' ? 'A new scenario, real prep time, and a judge who interrupts.' : 'Present out loud and get scored on the official rating sheet.'}
        right={<SearchBox value={q} onChange={setQ} label="Search events" />}
      />
      {list.length === 0 && !q && <Notice>These events aren’t set up yet. An officer can run setup again in Apps Script.</Notice>}
      {list.length === 0 && q && <p className="text-ink-2">No events match “{q}”.</p>}
      <RowSections sections={groups.map((g) => ({
        title: g,
        rows: list.filter((e) => (e.category || 'Presentation events') === g).map((e) => ({
          key: e.id, to: `${base(kind)}/${e.id}`, name: e.name,
          meta: e.ready ? timing(e) : 'Rating sheet loads when you open it',
          right: <ScorePip pct={e.attempts ? e.best : null} />,
        })),
      }))} />
    </div>
  );
}

/* ====================== Practice run ====================== */

type Step = 'setup' | 'prep' | 'present' | 'transcribing' | 'review' | 'questions' | 'qa' | 'scoring';
type QA = { q: string; a: string };

function Meter({ level }: { level: number }) {
  return (
    <div className="flex h-3 w-36 items-end gap-0.5" aria-label="Microphone level">
      {Array.from({ length: 12 }).map((_, i) => (
        <span key={i} className={`flex-1 transition-[height] duration-75 ${level * 12 > i ? (i > 9 ? 'bg-bad' : 'bg-gold') : 'bg-white/15'}`} style={{ height: `${30 + i * 6}%` }} />
      ))}
    </div>
  );
}

function ScenarioCard({ sc, compact = false }: { sc: Scenario; compact?: boolean }) {
  return (
    <article className={`${card} p-6`}>
      <Eyebrow>Your scenario</Eyebrow>
      <h2 className="mt-1.5 font-semiwide text-[19px] font-extrabold text-navy-950">{sc.title}</h2>
      <p className={`mt-2.5 text-[15px] leading-relaxed text-ink ${compact ? 'line-clamp-4' : ''}`}>{sc.background}</p>
      <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
        <div><dt className="text-[12px] font-bold text-ink-2">You are</dt><dd className="font-semibold text-navy-950">{sc.yourRole}</dd></div>
        <div><dt className="text-[12px] font-bold text-ink-2">The judge plays</dt><dd className="font-semibold text-navy-950">{sc.judgeRole}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[12px] font-bold text-ink-2">Your task</dt><dd className="font-semibold text-navy-950">{sc.task}</dd></div>
      </dl>
      {sc.indicators.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-bold text-ink-2">Performance indicators</p>
          <ul className="mt-1 grid gap-1 pl-5 text-[14px] [list-style:square] marker:text-gold">{sc.indicators.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
    </article>
  );
}

/** Top bar for every stage of a run, in focus mode. */
function RunBar({ title, sub, onExit, right }: { title: string; sub?: string; onExit: () => void; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onExit} className="cut-sm grid h-10 w-10 shrink-0 place-items-center bg-white text-navy-900 hover:bg-navy-100" aria-label="Exit">
          <Icon name="close" className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="truncate font-semiwide text-[15px] font-extrabold text-navy-950">{title}</div>
          {sub && <div className="truncate text-[13px] text-ink-2">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PresentEvent() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState<JudgeEventDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('setup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useFocusMode(step !== 'setup');

  // Setup
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'voice' | 'typed'>(recordingSupported() ? 'voice' : 'typed');
  const [slides, setSlides] = useState<{ text: string; words: number; url: string; name: string } | null>(null);
  const [prompt, setPrompt] = useState('');

  // Run
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [typed, setTyped] = useState('');
  const [talk, setTalk] = useState<Recording | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [secondsEach, setSecondsEach] = useState(60);
  const [qa, setQa] = useState<QA[]>([]);
  const [qi, setQi] = useState(0);
  const [answerTyped, setAnswerTyped] = useState('');
  const [answerMode, setAnswerMode] = useState<'voice' | 'typed'>('voice');
  const rec = useRecorder();
  const stopping = useRef(false);
  // Role play
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [notes, setNotes] = useState('');
  const [team, setTeam] = useState('');
  const [interjections, setInterjections] = useState<{ q: string; at: number }[]>([]);
  const interjectAsked = useRef(false);
  const interjecting = useRef(false);
  const roleplay = ev?.kind === 'roleplay';

  useEffect(() => {
    api.present.event(eventId).then(setEv).catch((e) => setLoadError(errorText(e)));
    return () => stopSpeaking();
  }, [eventId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { if (slides?.url) return () => URL.revokeObjectURL(slides.url); }, [slides]);

  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : 0;

  /* --- steps --- */

  async function addSlides(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Slides need to be a PDF. In Google Slides or PowerPoint, use File → Download → PDF.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('That PDF is over 15 MB. Export a smaller copy and try again.'); return; }
    setBusy('slides'); setError('');
    try {
      const b64 = await blobToBase64(file);
      const r = await api.present.slides(b64);
      setSlides({ text: r.text, words: r.words, url: URL.createObjectURL(file), name: file.name });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  }

  async function getPrompt() {
    setBusy('prompt'); setError('');
    try { setPrompt((await api.present.prompt(eventId)).prompt); } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  }

  async function beginPresenting() {
    if (!ev) return;
    setError('');
    if (mode === 'voice') {
      const ok = await rec.start();
      if (!ok) return;
    }
    stopping.current = false;
    interjectAsked.current = false;
    interjecting.current = false;
    setInterjections([]);
    setDeadline(Date.now() + Math.round((ev.presentMin || 7) * 60) * 1000);
    setStep('present');
    window.scrollTo({ top: 0 });
  }

  async function start() {
    if (!ev) return;
    if (ev.kind === 'roleplay') {
      setBusy('scenario'); setError('');
      try {
        const sc = await api.roleplay.scenario(eventId);
        setScenario(sc); setNotes('');
        setDeadline(Date.now() + Math.round((ev.prepMin || 20) * 60) * 1000);
        setStep('prep');
        window.scrollTo({ top: 0 });
      } catch (e) { setError(errorText(e)); }
      finally { setBusy(''); }
      return;
    }
    if (usesPrompt(ev) && !prompt) { setError('Get a practice prompt first.'); return; }
    if (ev.prepMin && prompt) {
      setDeadline(Date.now() + Math.round(ev.prepMin * 60) * 1000);
      setStep('prep');
      window.scrollTo({ top: 0 });
    } else void beginPresenting();
  }

  /** Every recording goes to Whisper, which also counts filler words and long pauses. */
  const transcribeTalk = useCallback(async (r: Recording) => {
    setStep('transcribing'); setError('');
    try {
      const t = await api.present.transcribe(await blobToBase64(r.blob), r.mime);
      setTranscript({ ...t, duration: t.duration || r.seconds });
      setStep('review');
    } catch (e) { setError(errorText(e)); }
  }, []);

  const finishPresenting = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (mode === 'voice') {
      const r = await rec.stop();
      if (!r) { setError('Nothing was recorded. Try again.'); setStep('setup'); return; }
      setTalk(r);
      void transcribeTalk(r);
    } else {
      const words = typed.trim().split(/\s+/).filter(Boolean).length;
      if (words < 25) { stopping.current = false; setError('Type more of your script first (at least a few sentences).'); return; }
      const secs = Math.round((words / 140) * 60);
      setTranscript({ text: typed.trim(), duration: secs, words, wpm: 140, fillers: 0, pauses: 0 });
      setStep('review');
    }
  }, [mode, rec, typed, transcribeTalk]);

  // Timers: prep ends → present; time's up → stop.
  useEffect(() => {
    if (step === 'prep' && deadline && left === 0) void beginPresenting();
    if (step === 'present' && deadline && left === 0 && mode === 'voice') void finishPresenting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, step]);

  // Role play: partway through, the judge interrupts in character with a question about what was said.
  useEffect(() => {
    if (step !== 'present' || !roleplay || !ev || !scenario || interjectAsked.current || interjecting.current || !deadline) return;
    const limit = Math.round((ev.presentMin || 7) * 60);
    if (limit - left < Math.round(limit * 0.45) || left < 20) return;
    interjecting.current = true;
    void (async () => {
      try {
        let soFar = typed;
        if (mode === 'voice') {
          const snap = await rec.snapshot();
          if (!snap) return; // nothing recorded yet: try again on the next tick
          soFar = (await api.present.transcribe(await blobToBase64(snap.blob), snap.mime)).text;
        }
        interjectAsked.current = true;
        const r = await api.roleplay.interject(eventId, scenario, soFar, limit - left);
        const at = Math.round(limit - Math.max(0, (deadline - Date.now()) / 1000));
        setInterjections((x) => [...x, { q: r.question, at }]);
        speak(r.question);
      } catch {
        interjectAsked.current = true; // skip the interruption rather than retry and distract
      } finally {
        interjecting.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, step]);

  async function toQuestions() {
    if (!ev || !transcript) return;
    if (ev.kind === 'roleplay') { void score([]); return; }
    const hasQa = ev.qaMin > 0 || isInterview(ev);
    if (!hasQa) { void score([]); return; }
    setStep('questions'); setError('');
    try {
      const r = await api.present.questions(eventId, title, transcript.text, slides?.text || '', prompt);
      setQuestions(r.questions); setSecondsEach(r.secondsEach); setQa([]); setQi(0);
      setAnswerMode(mode); setAnswerTyped('');
      setStep('qa');
      speak(r.questions[0]);
    } catch (e) { setError(errorText(e)); }
  }

  async function startAnswer() {
    stopSpeaking();
    const ok = await rec.start();
    if (ok) { stopping.current = false; setDeadline(Date.now() + secondsEach * 1000); }
  }

  const saveAnswer = useCallback(async (text: string) => {
    const next = [...qa, { q: questions[qi], a: text }];
    setQa(next); setAnswerTyped(''); setDeadline(0);
    if (qi + 1 < questions.length) { setQi(qi + 1); speak(questions[qi + 1]); }
    else void score(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qa, qi, questions]);

  const stopAnswer = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    const r = await rec.stop();
    setDeadline(0);
    if (!r) return;
    setBusy('answer'); setError('');
    try {
      const t = await api.present.transcribe(await blobToBase64(r.blob), r.mime);
      await saveAnswer(t.text);
    } catch (e) { setError(errorText(e) + ' You can type your answer instead.'); setAnswerMode('typed'); }
    finally { setBusy(''); }
  }, [rec, saveAnswer]);

  useEffect(() => { if (step === 'qa' && rec.recording && deadline && left === 0) void stopAnswer(); }, [left, step, rec.recording, deadline, stopAnswer]);

  async function score(answers: QA[]) {
    if (!transcript) return;
    setStep('scoring'); setError('');
    try {
      const res = await api.present.judge({
        eventId, title, transcript: transcript.text, slides: slides?.text || '', qa: answers, prompt,
        seconds: transcript.duration, wpm: transcript.wpm, fillers: mode === 'voice' ? transcript.fillers : -1, pauses: mode === 'voice' ? transcript.pauses : -1, mode,
        scenario, interjections, team: team.trim(),
      });
      try { sessionStorage.setItem('fblaprep.present.' + res.id, JSON.stringify(res)); } catch { /* ignore */ }
      navigate(`${base(ev?.kind || 'presentation')}/result/${res.id}`);
    } catch (e) { setError(errorText(e)); }
  }

  async function exitRun() {
    if ((step === 'present' || step === 'qa') && !window.confirm('Stop this run? It won’t be scored.')) return;
    stopSpeaking();
    if (rec.recording) await rec.stop();
    stopping.current = false;
    setDeadline(0); setError('');
    setStep('setup');
    window.scrollTo({ top: 0 });
  }

  /* --- render --- */

  if (loadError) return <Notice tone="bad">{loadError}</Notice>;
  if (!ev) return <Loading label="Reading this event’s rating sheet from the official guidelines. The first time takes about 15 seconds." />;
  const home = base(ev.kind);
  const total = ev.criteria.reduce((n, c) => n + c.points, 0);
  const runTitle = `${ev.name}${title ? `: ${title}` : ''}`;
  const problem = (error || rec.error) ? <div className="mt-4"><Notice tone="bad">{error || rec.error}</Notice></div> : null;

  // Prep and performance: timer band, then the material
  if (step === 'prep' || step === 'present') {
    const warn = left <= 60;
    return (
      <div className="animate-rise">
        <RunBar title={runTitle} sub={step === 'prep' ? 'Prep time' : roleplay ? 'Role play' : isInterview(ev) ? 'Interview' : 'Presenting'} onExit={() => void exitRun()} />
        <section className="ledger cut-lg flex flex-wrap items-center justify-between gap-6 py-6 pl-[64px] pr-6 text-white sm:pl-[80px] sm:pr-8 short:py-5">
          <div>
            <h1 className="font-wide text-[clamp(24px,3.4vw,34px)] font-black leading-none">{step === 'prep' ? (roleplay ? 'Read and prepare' : 'Prepare') : mode === 'voice' ? 'You’re on' : roleplay ? 'Type what you’d say' : 'Type your script'}</h1>
            {step === 'present' && mode === 'voice' && (
              <div className="mt-3 flex items-center gap-3">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-bad" aria-hidden="true" />
                <span className="text-[13px] font-bold text-navy-100">Recording</span>
                <Meter level={rec.level} />
              </div>
            )}
            {step === 'present' && warn && mode === 'voice' && <p className="mt-2 text-[14px] font-bold text-gold-300" aria-live="polite">{left > 0 ? 'One minute left.' : 'Time.'}</p>}
          </div>
          <div className={`font-wide text-[clamp(56px,8vw,96px)] font-black leading-none tabular-nums ${step === 'present' && warn ? (left <= 30 ? 'text-bad' : 'text-gold') : 'text-white'}`} aria-live="off">
            {clock(left)}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-3">
          {step === 'prep' && <button className={btn.gold} onClick={() => void beginPresenting()}>{roleplay ? 'Start the role play now' : 'Start presenting now'}<Icon name="arrow" className="h-4 w-4" /></button>}
          {step === 'present' && <button className={btn.gold} onClick={() => void finishPresenting()}>{mode === 'voice' ? 'Stop and get scored' : 'Done, get scored'}</button>}
        </div>
        {problem}

        {roleplay && interjections.length > 0 && step === 'present' && (
          <div className="cut mt-4 bg-gold p-5 text-navy-950 animate-rise" role="alert">
            <p className="text-[12px] font-black uppercase tracking-[0.12em]">The judge interrupts</p>
            <p className="mt-1 font-semiwide text-[19px] font-bold leading-snug">“{interjections[interjections.length - 1].q}”</p>
            <p className="mt-1.5 text-[14px] font-semibold">{mode === 'typed' ? 'Answer it in your script, then keep going.' : 'Answer it, then keep going.'}</p>
          </div>
        )}

        {roleplay && scenario && (
          <div className={`mt-4 grid gap-4 ${step === 'prep' ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
            <ScenarioCard sc={scenario} compact={step === 'present'} />
            {step === 'prep' ? (
              <label className={`${card} grid content-start gap-2 p-5 text-[13px] font-bold text-ink-2`}>
                Your notes
                <span className="font-normal">Two notecards’ worth.</span>
                <textarea className={`${input} min-h-56 text-[15px] font-normal`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key points, numbers, your recommendation" />
              </label>
            ) : notes.trim() ? (
              <div className={`${card} p-5`}><p className="text-[12px] font-bold text-ink-2">Your notes</p><p className="mt-1 whitespace-pre-wrap text-[15px]">{notes}</p></div>
            ) : null}
          </div>
        )}

        {prompt && !roleplay && (
          <div className={`${card} mt-4 p-5`}>
            <Eyebrow>{isInterview(ev) ? 'The job' : 'Your prompt'}</Eyebrow>
            <p className="mt-1.5 whitespace-pre-wrap text-[17px] text-navy-950">{prompt}</p>
          </div>
        )}

        {step === 'present' && mode === 'typed' && (
          <div className="mt-4">
            <textarea className={`${input} min-h-72 bg-white text-[16px]`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type or paste exactly what you’d say to the judges." aria-label="Your script" />
            <p className="mt-2 text-[13px] text-ink-2">{plural(typed.trim().split(/\s+/).filter(Boolean).length, 'word')}, about {clock((typed.trim().split(/\s+/).filter(Boolean).length / 140) * 60)} spoken</p>
          </div>
        )}

        {step === 'present' && slides && (
          <iframe title="Your slides" src={slides.url} className="cut mt-4 h-[62vh] w-full bg-white" />
        )}
      </div>
    );
  }

  if (step === 'transcribing' || step === 'questions' || step === 'scoring') {
    const label = step === 'transcribing' ? 'Whisper is turning your recording into text…' : step === 'questions' ? 'The judge is reading your presentation and writing questions…' : 'The judge is scoring you on the rating sheet…';
    return (
      <div className="mx-auto max-w-2xl">
        <RunBar title={runTitle} onExit={() => void exitRun()} />
        {!error && (
          <div className={`${card} flex items-center gap-4 p-6`} role="status">
            <Spinner />
            <span className="font-semibold text-navy-950">{label}</span>
          </div>
        )}
        {error && (
          <div className="grid gap-4">
            <Notice tone="bad">{error}</Notice>
            <div className="flex flex-wrap gap-3">
              {step === 'transcribing' && talk && <button className={btn.navy} onClick={() => void transcribeTalk(talk)}>Try transcribing again</button>}
              {step === 'questions' && <button className={btn.navy} onClick={() => void toQuestions()}>Try again</button>}
              {step === 'questions' && <button className={btn.quiet} onClick={() => void score([])}>Skip the questions and get scored</button>}
              {step === 'scoring' && <button className={btn.navy} onClick={() => void score(qa)}>Try scoring again</button>}
              <button className={btn.quiet} onClick={() => { setError(''); setStep('setup'); }}>Start over</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'review' && transcript) {
    return (
      <div className="mx-auto max-w-3xl animate-rise">
        <RunBar title={runTitle} sub="Check the transcript" onExit={() => void exitRun()} />
        <h1 className="font-wide text-[clamp(24px,3vw,32px)] font-black text-navy-950">What the judge heard</h1>
        <p className="mt-1 text-[15px] text-ink-2">Fix any misheard words before you’re scored.</p>
        <div className="mb-3 mt-4 flex flex-wrap gap-2">
          <span className="cut-sm bg-white px-3 py-1.5 text-[13px] font-bold">{clock(transcript.duration)} of {minutes(ev.presentMin || 7)}:00</span>
          <span className="cut-sm bg-white px-3 py-1.5 text-[13px] font-bold">{transcript.wpm} words per minute</span>
          {mode === 'voice' && <span className="cut-sm bg-white px-3 py-1.5 text-[13px] font-bold">{plural(transcript.fillers, 'filler sound')}</span>}
          {mode === 'voice' && <span className="cut-sm bg-white px-3 py-1.5 text-[13px] font-bold">{plural(transcript.pauses, 'long pause')}</span>}
        </div>
        <textarea className={`${input} min-h-64 bg-white text-[16px]`} value={transcript.text} onChange={(e) => setTranscript({ ...transcript, text: e.target.value })} aria-label="Transcript" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className={btn.gold} onClick={() => void toQuestions()}>{!roleplay && (ev.qaMin > 0 || isInterview(ev)) ? 'Continue to the judge’s questions' : 'Get scored'}<Icon name="arrow" className="h-4 w-4" /></button>
          <button className={btn.quiet} onClick={() => setStep('setup')}>Start over</button>
        </div>
      </div>
    );
  }

  if (step === 'qa') {
    const q = questions[qi];
    return (
      <div className="mx-auto max-w-3xl animate-rise">
        <RunBar title={runTitle} sub={isInterview(ev) ? 'Interview' : 'Judge questions'} onExit={() => void exitRun()}
          right={<span className="text-[13px] font-bold text-ink-2">{qi + 1} of {questions.length}</span>} />
        <div className="h-1.5 bg-white"><div className="h-full bg-gold" style={{ width: `${((qi + 1) / questions.length) * 100}%` }} /></div>
        <article className="cut mt-4 bg-navy-900 p-6 text-white">
          <Eyebrow light>The judge asks</Eyebrow>
          <h1 className="mt-2 font-semiwide text-[clamp(19px,2.6vw,24px)] font-bold leading-snug">{q}</h1>
          <button className="mt-3 text-[14px] font-bold text-navy-100 hover:text-white" onClick={() => speak(q)}>Hear it again</button>
        </article>

        {answerMode === 'voice' ? (
          <div className={`${card} mt-4 flex flex-wrap items-center justify-between gap-4 p-5`}>
            {rec.recording ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-bad" aria-hidden="true" />
                  <span className="font-bold">Answering</span>
                  <span className="font-wide text-2xl font-black tabular-nums text-navy-950">{clock(left)}</span>
                </div>
                <button className={btn.gold} onClick={() => void stopAnswer()}>Done answering</button>
              </>
            ) : busy === 'answer' ? <div className="flex items-center gap-3"><Spinner /><span className="font-semibold">Writing down your answer…</span></div> : (
              <>
                <p className="text-[15px] text-ink-2">You have about {clock(secondsEach)} to answer.</p>
                <div className="flex gap-2">
                  <button className={btn.navy} onClick={() => void startAnswer()}><Icon name="mic" className="h-4 w-4" />Answer out loud</button>
                  <button className={btn.quiet} onClick={() => setAnswerMode('typed')}>Type it</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <textarea className={`${input} min-h-32 bg-white`} value={answerTyped} onChange={(e) => setAnswerTyped(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
            <div className="mt-3 flex gap-2">
              <button className={btn.navy} disabled={!answerTyped.trim()} onClick={() => void saveAnswer(answerTyped.trim())}>{qi + 1 < questions.length ? 'Next question' : 'Get scored'}</button>
              {recordingSupported() && <button className={btn.quiet} onClick={() => setAnswerMode('voice')}>Answer out loud instead</button>}
            </div>
          </div>
        )}
        <button className="mt-4 text-[14px] font-bold text-ink-3 hover:text-navy-950" onClick={() => void saveAnswer('')}>Skip this question</button>
        {problem}
      </div>
    );
  }

  // Setup
  const guides = guidesFor(ev.name);
  return (
    <div className="animate-rise">
      <PageHead title={ev.name} eyebrow={ev.category || (roleplay ? 'Role play' : 'Presentation')} sub={ev.ready ? <>{timing(ev)}{ev.format ? ` · ${ev.format}` : ''}</> : undefined} back={{ to: home, label: roleplay ? 'Role plays' : 'Presentations' }} />

      {!ev.ready && <div className="mb-6"><Notice tone="bad">{ev.note || 'The rating sheet hasn’t loaded yet. Try again in a few minutes.'}</Notice></div>}

      {ev.ready && (
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_340px]">
          <section className={`${card} p-6 lg:self-start`}>
            <h2 className="font-semiwide text-[19px] font-extrabold text-navy-950">Practice run</h2>

            {roleplay && (
              <>
                <p className="mt-2 text-[15px] text-ink-2">You get a new scenario and prep time, then the role play. Halfway through, the judge interrupts.</p>
                <label className="mt-5 grid gap-1.5 text-[13px] font-bold text-ink-2">
                  <span>Teammates <span className="font-normal">(optional, for team role plays)</span></span>
                  <input className={input} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="For example: Priya, Sam" />
                </label>
                {team.trim() && <p className="mt-2 text-[13px] text-ink-2">Say your name the first time you speak.</p>}
              </>
            )}

            {!isInterview(ev) && !roleplay && (
              <label className="mt-5 grid gap-1.5 text-[13px] font-bold text-ink-2">
                <span>Topic <span className="font-normal">(optional)</span></span>
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: SnackSmart, a healthy vending business" />
              </label>
            )}

            {usesPrompt(ev) && !roleplay && (
              <div className="mt-5">
                <p className="text-[13px] font-bold text-ink-2">{isInterview(ev) ? 'Practice job posting' : 'Practice prompt'}</p>
                {prompt ? <p className="cut-sm mt-2 whitespace-pre-wrap bg-navy-50 p-4 text-[15px]">{prompt}</p> : null}
                <button className={`${btn.quiet} mt-2`} disabled={busy === 'prompt'} onClick={() => void getPrompt()}>
                  {busy === 'prompt' ? 'Writing one…' : prompt ? 'Get a different one' : isInterview(ev) ? 'Get a job posting' : 'Get a prompt'}
                </button>
                {ev.prepMin > 0 && <p className="mt-2 text-[13px] text-ink-2">You’ll get {minutes(ev.prepMin)} minutes to prepare after you start.</p>}
              </div>
            )}

            {!isInterview(ev) && !roleplay && !/impromptu|public speaking/i.test(ev.name) && (
              <div className="mt-5">
                <p className="text-[13px] font-bold text-ink-2">Slides <span className="font-normal">(optional PDF)</span></p>
                {slides ? (
                  <p className="mt-2 text-[14px]"><b>{slides.name}</b> added, {plural(slides.words, 'word')} of text. <button className={btn.link} onClick={() => setSlides(null)}>Remove</button></p>
                ) : (
                  <label className={`${btn.quiet} mt-2 cursor-pointer`}>
                    {busy === 'slides' ? 'Reading your slides…' : 'Add slides (PDF)'}
                    <input type="file" accept="application/pdf" className="sr-only" disabled={busy === 'slides'} onChange={(e) => void addSlides(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}

            <fieldset className="mt-6">
              <legend className="text-[13px] font-bold text-ink-2">How you’ll present</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup">
                {([['voice', 'Out loud', 'Recorded, then transcribed by Whisper.'], ['typed', 'Type it', 'No microphone needed.']] as const).map(([m, label, desc]) => (
                  <button key={m} role="radio" aria-checked={mode === m} disabled={m === 'voice' && !recordingSupported()} onClick={() => setMode(m)}
                    className={`cut-sm px-4 py-3 text-left transition ${mode === m ? 'bg-navy-900 text-white' : 'bg-navy-50 text-ink hover:bg-navy-100'} disabled:opacity-50`}>
                    <span className={`flex items-center gap-2 font-bold ${mode === m ? 'text-gold' : 'text-navy-950'}`}>{m === 'voice' && <Icon name="mic" className="h-4 w-4" />}{label}</span>
                    <span className={`text-[13px] ${mode === m ? 'text-navy-100' : 'text-ink-2'}`}>{desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button className={btn.gold} disabled={!!busy} onClick={() => void start()}>
                {busy === 'scenario' ? 'Writing your scenario…' : roleplay ? 'Get my scenario' : ev.prepMin && usesPrompt(ev) ? 'Start prep time' : 'Start presenting'}
                {!busy && <Icon name="arrow" className="h-4 w-4" />}
              </button>
              {mode === 'voice' && <p className="text-[13px] text-ink-2">Audio is transcribed, then deleted.</p>}
            </div>
            {problem}
          </section>

          <div className="grid content-start gap-4">
            <section className={`${card} p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">Rating sheet</h2>
                <span className="text-[13px] font-bold text-ink-2">{total} points</span>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {ev.criteria.map((c) => (
                  <li key={c.name} className="flex justify-between gap-4 py-2.5 text-[13px]">
                    <span><b className="text-[14px] text-navy-950">{c.name}</b><span className="block text-ink-2">{c.description}</span></span>
                    <span className="shrink-0 font-wide font-black text-navy-900">{c.points}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className={`${card} p-5`}>
              <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">Study</h2>
              <div className="mt-4">
                <StudySources guides={guides} official={ev.guide ? [{ label: '2026–27 guidelines', url: ev.guide }] : []} />
              </div>
            </section>
          </div>
        </div>
      )}

      {ev.history.length > 0 && (
        <Section title="Your runs" count={ev.history.length} className="mt-10">
          <ul className={`${card} divide-y divide-line`}>
            {ev.history.map((h) => (
              <li key={h.id}>
                <Link to={`${home}/result/${h.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-navy-50">
                  <span><span className="block font-bold text-navy-950">{h.title || ev.name}</span><span className="text-[13px] text-ink-2">{shortDate(h.submitted)} · {clock(h.seconds)}</span></span>
                  <ScorePip pct={h.pct} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/* ====================== Results ====================== */

function highlightFillers(text: string) {
  return text.split(/(\b(?:u+m+|u+h+|e+r+m+|hmm+|you know)\b)/gi).map((part, i) =>
    /^(u+m+|u+h+|e+r+m+|hmm+|you know)$/i.test(part) ? <mark key={i} className="bg-gold-100 px-0.5 font-bold text-navy-950">{part}</mark> : <span key={i}>{part}</span>);
}

export function PresentResultPage() {
  const { id = '' } = useParams();
  const [res, setRes] = useState<PresentResult | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('fblaprep.present.' + id) || 'null') as PresentResult | null; } catch { return null; }
  });
  const [error, setError] = useState('');
  useEffect(() => { if (!res) api.present.result(id).then(setRes).catch((e) => setError(errorText(e))); }, [id, res]);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!res) return <Loading label="Loading your scores…" />;

  const judged = res.criteria.filter((c) => c.judged);
  const notJudged = res.criteria.filter((c) => !c.judged);
  const over = res.seconds - res.limitSeconds;
  const typed = res.mode === 'typed';
  const measured = (n: number) => (typed || n < 0 ? 'Not measured' : String(n));

  return (
    <div className="animate-rise">
      <ScoreBand pct={res.pct} eyebrow={`${res.eventName}${res.title ? `: ${res.title}` : ''}`} title={verdictFor(res.pct)} line={`${res.score} of ${res.max} points`} />

      <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['Time', `${clock(res.seconds)} of ${clock(res.limitSeconds)}`, over > 0 ? `${clock(over)} over the limit` : res.seconds < res.limitSeconds * 0.6 ? 'Well under the limit' : 'Within the limit'],
          ['Pace', typed ? 'Not measured' : `${res.wpm} wpm`, typed ? 'Typed script' : res.wpm > 170 ? 'Fast. Aim for 130 to 160.' : res.wpm < 110 ? 'Slow. Aim for 130 to 160.' : 'Good pace'],
          ['Filler sounds', measured(res.fillers), typed ? 'Typed script' : 'Um, uh, and similar'],
          ['Long pauses', measured(res.pauses), typed ? 'Typed script' : '3 seconds or more'],
        ].map(([label, value, note]) => (
          <div key={label} className={`${card} p-4`}>
            <div className="text-[12px] font-bold text-ink-2">{label}</div>
            <div className="mt-1 font-wide text-[19px] font-black text-navy-950">{value}</div>
            <div className={`mt-0.5 text-[12px] ${label === 'Time' && over > 0 ? 'font-bold text-bad' : 'text-ink-2'}`}>{note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`${base(res.kind || 'presentation')}/${res.eventId}`} className={btn.gold}>{res.kind === 'roleplay' ? 'Try a new scenario' : 'Practice again'}</Link>
        <Link to={base(res.kind || 'presentation')} className={btn.quiet}>{res.kind === 'roleplay' ? 'All role plays' : 'All presentation events'}</Link>
      </div>

      {res.summary && <p className={`${card} mt-8 border-l-4 border-gold p-5 text-[16px] leading-relaxed text-navy-950`}>{res.summary}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className={`${card} p-5`}>
          <h2 className="font-semiwide text-[16px] font-extrabold text-good">What worked</h2>
          <ul className="mt-2 grid gap-2 pl-5 text-[15px] [list-style:square] marker:text-good">{res.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
        <section className={`${card} p-5`}>
          <h2 className="font-semiwide text-[16px] font-extrabold text-bad">Fix these first</h2>
          <ol className="mt-2 grid list-decimal gap-2 pl-5 text-[15px]">{res.improvements.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
      </div>

      {res.coverage && res.coverage.length > 0 && (
        <Section title="Performance indicators" right={<span className="text-[13px] font-bold text-ink-2">{res.coverage.filter((c) => c.covered).length} of {res.coverage.length} covered</span>} className="mt-10">
          <ul className={`${card} divide-y divide-line`}>
            {res.coverage.map((c) => (
              <li key={c.name} className="flex gap-3 px-5 py-3.5">
                <span className={`cut-sm grid h-7 w-7 shrink-0 place-items-center ${c.covered ? 'bg-good text-white' : 'bg-bad-100 text-bad'}`} aria-hidden="true">{c.covered ? <Icon name="check" className="h-4 w-4" stroke={3} /> : <Icon name="close" className="h-4 w-4" stroke={3} />}</span>
                <span><b className="text-navy-950">{c.name}</b><span className="sr-only">{c.covered ? ', covered' : ', missed'}</span>{c.note ? <span className="block text-[14px] text-ink-2">{c.note}</span> : null}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Rating sheet" className="mt-10">
        <div className="grid gap-2.5">
          {judged.map((c) => {
            const pct = c.max ? Math.round(((c.points || 0) / c.max) * 100) : 0;
            return (
              <div key={c.name} className={`${card} p-5`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold text-navy-950">{c.name}</span>
                  <span className="font-wide text-[17px] font-black tabular-nums text-navy-900">{c.points}/{c.max}</span>
                </div>
                <div className="mt-2"><Bar pct={pct} /></div>
                {c.evidence && <p className="mt-3 border-l-4 border-gold pl-3 text-[15px] italic text-ink-2">“{c.evidence}”</p>}
                {c.feedback && <p className="mt-2 text-[15px] text-ink">{c.feedback}</p>}
              </div>
            );
          })}
        </div>
        {notJudged.length > 0 && (
          <div className="cut mt-4 bg-navy-100 p-5">
            <h3 className="font-bold text-navy-950">Judged in person</h3>
            <p className="text-[13px] text-ink-2">Not in your score.</p>
            <ul className="mt-2 grid gap-1.5 text-[14px]">
              {notJudged.map((c) => <li key={c.name}><b>{c.name}</b> ({c.max} points){c.feedback ? `: ${c.feedback}` : ''}</li>)}
            </ul>
          </div>
        )}
      </Section>

      {res.qa.length > 0 && (
        <Section title="Judge questions" className="mt-10">
          <ol className="grid gap-2.5">
            {res.qa.map((x, i) => (
              <li key={i} className={`${card} p-5`}>
                <p className="font-bold text-navy-950">Q{i + 1}. {x.q}</p>
                <p className="mt-2 text-[15px] text-ink-2">{x.a || <i>Skipped</i>}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {res.interjections && res.interjections.length > 0 && (
        <Section title="When the judge interrupted" className="mt-10">
          <ul className="grid gap-2.5">
            {res.interjections.map((x, i) => (
              <li key={i} className={`${card} p-5`}><p className="font-bold text-navy-950">“{x.q}”</p><p className="mt-1 text-[13px] text-ink-2">At {clock(x.at)}</p></li>
            ))}
          </ul>
        </Section>
      )}

      {res.scenario && <Section title="The scenario" className="mt-10"><ScenarioCard sc={res.scenario} /></Section>}

      {res.prompt && (
        <Section title="Your prompt" className="mt-10">
          <p className={`${card} whitespace-pre-wrap p-5 text-[15px]`}>{res.prompt}</p>
        </Section>
      )}

      <details className={`${card} mt-10 p-5`}>
        <summary className="cursor-pointer font-semiwide text-[16px] font-extrabold text-navy-950">Transcript</summary>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{highlightFillers(res.transcript)}</p>
      </details>
    </div>
  );
}
