import type { Mastery, Mode } from '../types';

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseISO(s: string): Date { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function daysUntil(s: string): number { return Math.round((parseISO(s).getTime() - parseISO(todayISO()).getTime()) / 86_400_000); }
export function longDate(s: string): string { return parseISO(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
export function shortDate(iso: string): string { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function plural(n: number, word: string, many?: string): string { return `${n} ${n === 1 ? word : many || word + 's'}`; }
export const MODE_LABEL: Record<Mode, string> = { drill: 'Quick drill', weak: 'Weak-spot drill', full: 'Full practice test' };

/** Mastery for one event: percent correct across every topic, or null if never practiced. */
export function eventMastery(m: Mastery[], eventId: string): { pct: number | null; attempts: number } {
  const rows = m.filter((x) => x.eventId === eventId);
  const attempts = rows.reduce((n, r) => n + r.attempts, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  return { pct: attempts ? Math.round((correct / attempts) * 100) : null, attempts };
}
export function topicMastery(m: Mastery[], eventId: string, topic: string): { pct: number | null; attempts: number } {
  const r = m.find((x) => x.eventId === eventId && x.topic === topic);
  return { pct: r && r.attempts ? Math.round((r.correct / r.attempts) * 100) : null, attempts: r?.attempts || 0 };
}
export const LETTERS = ['A', 'B', 'C', 'D'];
