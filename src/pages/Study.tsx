import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { LEVEL_LABEL, savedLevel, shortDate } from '../lib/format';
import { btn, Loading, Notice } from '../components/Layout';
import { beginSession } from './Practice';
import type { StudyNotes } from '../types';

/** Renders the study guide's small markdown subset: ## headings, - bullets, **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-bold text-navy-950">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>);
}
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={blocks.length} className="mt-2 grid gap-1.5 pl-5 text-[16px] leading-relaxed [list-style:square] marker:text-gold">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    if (/^#{1,3}\s/.test(line)) {
      flush();
      blocks.push(<h2 key={blocks.length} className="mt-8 font-semiwide text-xl font-extrabold text-navy-950 first:mt-0">{line.replace(/^#{1,3}\s/, '')}</h2>);
    } else if (/^[-*•]\s/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s/, ''));
    } else {
      flush();
      blocks.push(<p key={blocks.length} className="mt-2 text-[16px] leading-relaxed">{inline(line)}</p>);
    }
  });
  flush();
  return <div>{blocks}</div>;
}

export function Study() {
  const { eventId = '', topic: rawTopic = '' } = useParams();
  const topic = decodeURIComponent(rawTopic);
  const { data } = useData();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<StudyNotes | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const event = data?.events.find((e) => e.id === eventId);
  const t = event?.topics.find((x) => x.name === topic);
  const level = savedLevel(eventId);

  useEffect(() => {
    setNotes(null); setError('');
    api.notes(eventId, topic).then(setNotes).catch((e) => setError(errorText(e)));
  }, [eventId, topic]);

  async function drill() {
    setBusy(true);
    try { await beginSession(eventId, 'drill', level, topic); navigate('/session'); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <Link to={`/practice/${eventId}`} className="text-[14px] font-bold text-ink-2 hover:text-navy-950">{event?.name || 'Back to the event'}</Link>
      <h1 className="mt-3 font-wide text-[clamp(28px,4.5vw,42px)] font-black leading-[1.02] tracking-tight text-navy-950">{topic}</h1>
      {t?.items ? <p className="mt-2 text-[15px] text-ink-2">{t.items} questions on the real test.</p> : null}

      {error && <div className="mt-6"><Notice tone="bad">{error}</Notice></div>}
      {!notes && !error && <Loading label="Writing the study guide…" />}
      {notes && (
        <article className="cut mt-6 bg-white p-6 sm:p-8">
          <Markdown text={notes.content} />
          <p className="mt-8 border-t border-line pt-4 text-[13px] text-ink-3">
            Written {shortDate(notes.updated)} from the 2026–27 guidelines.
          </p>
        </article>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button className={btn.gold} disabled={busy} onClick={() => void drill()}>{busy ? 'Starting…' : `Drill this topic (${LEVEL_LABEL[level]})`}</button>
        {data?.me.admin && notes && (
          <button className={btn.quiet} disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try { setNotes(await api.notes(eventId, topic, true)); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
          }}>Rewrite this guide</button>
        )}
      </div>
    </div>
  );
}
