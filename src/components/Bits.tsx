import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { External, Icon } from './Layout';
import type { Guide } from '../data/guides';

/** A strip of answer-sheet bubbles that fill in gold on load. The landing page's one animated moment. */
const PATTERN = [2, 0, 3, 1, 1, 2, 0, 3];
export function AnswerSheet({ rows = 8 }: { rows?: number }) {
  return (
    <div className="grid gap-2.5" aria-hidden="true">
      {PATTERN.slice(0, rows).map((pick, r) => (
        <div key={r} className="flex items-center gap-3">
          <span className="w-6 text-right font-wide text-[13px] font-black tabular-nums text-navy-300">{r + 1}</span>
          {['A', 'B', 'C', 'D'].map((l, c) => (
            <span key={l} className="relative grid h-8 w-8 place-items-center rounded-full ring-2 ring-white/25">
              {c === pick && <span className="bubble-fill absolute inset-0.5 rounded-full" style={{ animationDelay: `${250 + r * 110}ms` }} />}
              <span className={`relative text-[12px] font-black ${c === pick ? 'text-navy-950' : 'text-white/45'}`}>{l}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The three ways to practice. */
export type Lane = { to: string; icon: 'tests' | 'present' | 'roleplay'; title: string; count: string; line: string };
export const LANES: Lane[] = [
  { to: '/practice', icon: 'tests', title: 'Tests', count: '45 events', line: 'Drills, full practice tests, and study guides.' },
  { to: '/present', icon: 'present', title: 'Presentations', count: '32 events', line: 'Present out loud. Scored on the official rating sheet.' },
  { to: '/roleplay', icon: 'roleplay', title: 'Role plays', count: '12 events', line: 'A new scenario each time. The judge interrupts.' },
];
export function LaneCards({ lanes = LANES, linked = true }: { lanes?: Lane[]; linked?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {lanes.map((m) => {
        const inner = (
          <>
            <span className="cut-sm grid h-11 w-11 shrink-0 place-items-center bg-navy-900 text-gold"><Icon name={m.icon} className="h-[22px] w-[22px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-wide text-[19px] font-black text-navy-950">{m.title}</span>
                <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-ink-3">{m.count}</span>
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug text-ink-2">{m.line}</span>
            </span>
          </>
        );
        return linked
          ? <Link key={m.to} to={m.to} className="cut group flex items-start gap-4 bg-white p-5 transition hover:bg-navy-50">{inner}</Link>
          : <div key={m.to} className="cut flex items-start gap-4 bg-white p-5">{inner}</div>;
      })}
    </div>
  );
}

/** Event rows grouped by section, like the lines of a rating sheet. */
export type Row = { key: string; to: string; name: string; meta?: string; right?: ReactNode; dim?: boolean };
export function RowSections({ sections }: { sections: { title: string; rows: Row[] }[] }) {
  return (
    <div className="grid gap-10">
      {sections.filter((s) => s.rows.length).map((s) => (
        <section key={s.title}>
          <div className="mb-3 flex items-baseline justify-between border-b-2 border-navy-900 pb-2">
            <h2 className="font-semiwide text-[17px] font-extrabold text-navy-950">{s.title}</h2>
            <span className="font-wide text-[14px] font-black tabular-nums text-ink-3">{s.rows.length}</span>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {s.rows.map((r) => (
              <li key={r.key}>
                <Link to={r.to} className={`cut-sm group flex items-center justify-between gap-4 bg-white px-4 py-3 transition hover:bg-navy-50 ${r.dim ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold text-navy-950 group-hover:text-blue">{r.name}</span>
                    {r.meta && <span className="block truncate text-[13px] text-ink-2">{r.meta}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {r.right}
                    <Icon name="arrow" className="h-4 w-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-navy-950" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A small score readout. */
export function ScorePip({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span className="text-[13px] font-bold text-ink-3">{label || 'New'}</span>;
  const tone = pct >= 80 ? 'bg-good text-white' : pct >= 60 ? 'bg-gold text-navy-950' : 'bg-navy-100 text-navy-900';
  return <span className={`cut-sm inline-block min-w-[50px] px-2 py-1 text-center font-wide text-[13px] font-black tabular-nums ${tone}`}>{pct}%</span>;
}

/** One way to practice an event. Disabled cards say why instead of showing a dead button. */
export function ActionCard({ title, line, action, note, primary = false, disabled = false, extra }: {
  title: string; line: string; action?: ReactNode; note?: string; primary?: boolean; disabled?: boolean; extra?: ReactNode;
}) {
  const tone = primary ? 'bg-navy-900 text-white' : 'bg-white text-navy-950';
  return (
    <div className={`cut flex flex-col p-5 ${tone} ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-semiwide text-[17px] font-extrabold ${primary ? 'text-gold' : 'text-navy-950'}`}>{title}</h3>
        {extra}
      </div>
      <p className={`mt-1 flex-1 text-[14px] leading-snug ${primary ? 'text-navy-100' : 'text-ink-2'}`}>{line}</p>
      <div className="mt-4">
        {disabled
          ? <p className={`text-[13px] font-bold ${primary ? 'text-gold-300' : 'text-ink-3'}`}>{note}</p>
          : action}
      </div>
    </div>
  );
}

/** Study sources: the chapter's own folder, professional guides, and the official FBLA documents. */
export function StudySources({ chapter, guides, official }: {
  chapter?: { label: string; url: string } | null;
  guides: Guide[];
  official: { label: string; url: string }[];
}) {
  const group = (title: string, items: ReactNode) => (
    <div>
      <p className="font-semiwide text-[12px] font-extrabold uppercase tracking-[0.12em] text-ink-3">{title}</p>
      <ul className="mt-2 grid gap-2">{items}</ul>
    </div>
  );
  return (
    <div className="grid gap-5">
      {guides.length > 0 && group('Professional guides', guides.map((g) => (
        <li key={g.url}>
          <a href={g.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3">
            <span className="cut-sm mt-0.5 grid h-8 w-8 shrink-0 place-items-center bg-navy-50 text-navy-900 group-hover:bg-gold"><Icon name="book" className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold leading-snug text-navy-950 group-hover:text-blue">{g.title}</span>
              <span className="block text-[12px] text-ink-2">{g.source}</span>
            </span>
          </a>
        </li>
      )))}
      {chapter && group('Chapter', <li><External href={chapter.url} className="text-[14px] font-bold text-blue hover:underline">{chapter.label}</External></li>)}
      {official.length > 0 && group('Official', official.map((o) => (
        <li key={o.url}><External href={o.url} className="text-[14px] font-bold text-blue hover:underline">{o.label}</External></li>
      )))}
    </div>
  );
}
