import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { LEVEL_LABEL, savedLevel, shortDate } from '../lib/format';
import { btn, card, Icon, Loading, Notice } from '../components/Layout';
import { StudySources } from '../components/Bits';
import { guidesFor } from '../data/guides';
import { STUDY_LABEL, STUDY_LINKS } from '../data/studyLinks';
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
      blocks.push(<h2 key={blocks.length} className="mt-7 font-semiwide text-[19px] font-extrabold text-navy-950 first:mt-0">{line.replace(/^#{1,3}\s/, '')}</h2>);
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

  const study = event ? STUDY_LINKS[event.name] : undefined;
  return (
    <div className="animate-rise">
      <Link to={`/practice/${eventId}`} className={`${btn.ghost} mb-3`}><Icon name="back" className="h-4 w-4" stroke={2.4} />{event?.name || 'Back to the event'}</Link>
      <h1 className="font-wide text-[clamp(26px,3.4vw,38px)] font-black leading-[1.04] tracking-tight text-navy-950">{topic}</h1>
      {t?.items ? <p className="mt-2 text-[15px] text-ink-2">{t.items} questions on the real test.</p> : null}

      <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {error && <Notice tone="bad">{error}</Notice>}
          {!notes && !error && <Loading label="Writing the study guide…" />}
          {notes && (
            <article className={`${card} p-6 sm:p-8`}>
              <Markdown text={notes.content} />
              <p className="mt-8 border-t border-line pt-4 text-[13px] text-ink-3">
                Written {shortDate(notes.updated)} from the 2026–27 guidelines. Check facts against the sources on this page.
              </p>
            </article>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button className={btn.gold} disabled={busy} onClick={() => void drill()}>{busy ? 'Starting…' : `Drill this topic (${LEVEL_LABEL[level]})`}</button>
            {data?.me.admin && notes && (
              <button className={btn.quiet} disabled={busy} onClick={async () => {
                setBusy(true); setError('');
                try { setNotes(await api.notes(eventId, topic, true)); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
              }}>Rewrite this guide</button>
            )}
          </div>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className={`${card} p-5`}>
            <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">Go deeper</h2>
            <div className="mt-4">
              <StudySources
                guides={event ? guidesFor(event.name) : []}
                chapter={study ? { label: STUDY_LABEL[study.kind], url: study.url } : null}
                official={event?.guide ? [{ label: '2026–27 guidelines', url: event.guide }] : []}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
