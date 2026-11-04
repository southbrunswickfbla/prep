import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** A strip of answer-sheet bubbles that fill in gold on load. The landing page's one animated moment. */
const PATTERN = [2, 0, 3, 1, 1, 2, 0, 3];
export function AnswerSheet({ rows = 8 }: { rows?: number }) {
  return (
    <div className="grid gap-2.5" aria-hidden="true">
      {PATTERN.slice(0, rows).map((pick, r) => (
        <div key={r} className="flex items-center gap-3">
          <span className="w-6 text-right font-wide text-[13px] font-black tabular-nums text-navy-200">{r + 1}</span>
          {['A', 'B', 'C', 'D'].map((l, c) => (
            <span key={l} className="relative grid h-8 w-8 place-items-center rounded-full ring-2 ring-white/25">
              {c === pick && <span className="bubble-fill absolute inset-0.5 rounded-full" style={{ animationDelay: `${300 + r * 110}ms` }} />}
              <span className={`relative text-[12px] font-black ${c === pick ? 'text-navy-950' : 'text-white/45'}`}>{l}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The three ways to practice. The first tile leads; the others follow it. */
export type Mode = { to: string; count: string; title: string; line: string; extra?: ReactNode };
export function ModeTiles({ modes }: { modes: Mode[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-[1.25fr_1fr_1fr]">
      {modes.map((m, i) => (
        <Link
          key={m.to} to={m.to}
          className={`cut-lg group flex min-h-[180px] flex-col md:min-h-[220px] justify-between p-6 transition-colors ${i === 0 ? 'bg-navy-900 text-white hover:bg-navy-800' : 'bg-white text-navy-950 hover:bg-navy-100/60'}`}
        >
          <div className={`font-wide text-[56px] font-black leading-none tracking-tight tabular-nums ${i === 0 ? 'text-gold' : 'text-navy-900'}`}>{m.count}</div>
          <div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <h2 className="font-wide text-[22px] font-black leading-tight">{m.title}</h2>
              <span className={`cut-sm grid h-9 w-9 shrink-0 place-items-center transition-transform group-hover:translate-x-1 ${i === 0 ? 'bg-gold text-navy-950' : 'bg-navy-900 text-gold'}`} aria-hidden="true">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 8h9M8 3.5 12.5 8 8 12.5" /></svg>
              </span>
            </div>
            <p className={`mt-1.5 text-[15px] ${i === 0 ? 'text-navy-100' : 'text-ink-2'}`}>{m.line}</p>
            {m.extra}
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Ruled event rows grouped by section, like the lines of a rating sheet. */
export type Row = { key: string; to: string; name: string; meta?: string; right?: ReactNode; dim?: boolean };
export function RowSections({ sections }: { sections: { title: string; rows: Row[] }[] }) {
  return (
    <div className="grid gap-12">
      {sections.filter((s) => s.rows.length).map((s) => (
        <section key={s.title}>
          <div className="flex items-baseline justify-between border-b-[3px] border-navy-900 pb-2">
            <h2 className="font-wide text-[19px] font-black text-navy-950">{s.title}</h2>
            <span className="font-wide text-[15px] font-black tabular-nums text-ink-3">{s.rows.length}</span>
          </div>
          <ul className="grid md:grid-cols-2 md:gap-x-10">
            {s.rows.map((r) => (
              <li key={r.key} className="border-b border-line">
                <Link to={r.to} className={`group -mx-2 flex items-center justify-between gap-4 px-2 py-3.5 transition-colors hover:bg-white ${r.dim ? 'opacity-55' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-bold text-navy-950 group-hover:text-blue">{r.name}</span>
                    {r.meta && <span className="block truncate text-[13px] text-ink-2">{r.meta}</span>}
                  </span>
                  <span className="shrink-0">{r.right}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A small score readout used on the right of a row. */
export function ScorePip({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span className="text-[13px] font-bold text-ink-3">{label || 'New'}</span>;
  const tone = pct >= 80 ? 'bg-good text-white' : pct >= 60 ? 'bg-gold text-navy-950' : 'bg-navy-100 text-navy-900';
  return <span className={`cut-sm inline-block min-w-[52px] px-2 py-1 text-center font-wide text-[14px] font-black tabular-nums ${tone}`}>{pct}%</span>;
}
