export type Topic = { name: string; weight: number; objectives?: string; /** Questions on the real test, from the guidelines. */ items?: number };

export type EventSummary = {
  id: string;
  name: string;
  category: string;
  topics: Topic[];
  bank: number;
  bankByTopic: Record<string, number>;
  /** Link to the official 2026–27 guidelines PDF. */
  guide?: string;
  /** Status from loading the guidelines, shown to officers. */
  note?: string;
};

export type Me = { email: string; name: string; picture: string; admin: boolean; staff: boolean };

export type Mastery = { eventId: string; topic: string; attempts: number; correct: number };

export type SessionRow = {
  id: string; eventId: string; eventName: string; mode: Mode;
  total: number; correct: number; pct: number; submitted: string;
};

export type Dashboard = { me: Me; events: EventSummary[]; mastery: Mastery[]; recent: SessionRow[] };

export type Mode = 'drill' | 'weak' | 'full';

export type Question = {
  id: string; topic: string; stem: string; choices: string[];
  /** Included for drills, so feedback is instant. Withheld on full practice tests. */
  answer?: number; explanation?: string;
};

export type StartRes = {
  sessionId: string; mode: Mode; eventId: string; eventName: string;
  timeLimit: number | null; questions: Question[]; generated: number;
};

export type ReviewItem = {
  id: string; topic: string; stem: string; choices: string[];
  answer: number; chosen: number | null; correct: boolean; explanation: string;
};

export type Results = {
  sessionId: string; eventId: string; eventName: string; mode: Mode;
  total: number; correct: number; pct: number; seconds: number; submitted: string;
  byTopic: { topic: string; total: number; correct: number }[];
  review: ReviewItem[];
};

export type FlaggedQuestion = {
  id: string; eventId: string; eventName: string; topic: string; stem: string;
  choices: string[]; answer: number; explanation: string; flags: number; status: string; reasons: string[];
};

export type AdminOverview = { events: EventSummary[]; flagged: FlaggedQuestion[]; target: number; aiReady: boolean; model: string };
