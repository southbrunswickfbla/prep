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
  id: string; eventId: string; eventName: string; mode: Mode; level: Level;
  total: number; correct: number; pct: number; submitted: string;
};

/** Best and latest full-practice-test scores per event and level. */
export type Best = { eventId: string; level: Level; best: number; last: number; count: number };

export type Dashboard = {
  me: Me; events: EventSummary[]; mastery: Mastery[]; recent: SessionRow[];
  /** How many missed questions are waiting for review, per event. */
  missed: { eventId: string; count: number }[];
  bests: Best[];
};

export type Mode = 'drill' | 'weak' | 'full' | 'review';

/** Practice difficulty, named for the competition level it prepares you for. */
export type Level = 'rce' | 'slc' | 'nlc';

export type Question = {
  id: string; topic: string; stem: string; choices: string[]; difficulty?: 'easy' | 'medium' | 'hard';
  /** Included for drills, so feedback is instant. Withheld on full practice tests. */
  answer?: number; explanation?: string;
};

export type StartRes = {
  sessionId: string; mode: Mode; level: Level; eventId: string; eventName: string;
  timeLimit: number | null; questions: Question[]; generated: number;
};

export type ReviewItem = {
  id: string; topic: string; stem: string; choices: string[];
  answer: number; chosen: number | null; correct: boolean; explanation: string;
};

export type Results = {
  sessionId: string; eventId: string; eventName: string; mode: Mode; level: Level;
  total: number; correct: number; pct: number; seconds: number; submitted: string;
  byTopic: { topic: string; total: number; correct: number }[];
  review: ReviewItem[];
};

export type FlaggedQuestion = {
  id: string; eventId: string; eventName: string; topic: string; stem: string;
  choices: string[]; answer: number; explanation: string; flags: number; status: string; reasons: string[];
};

export type UsageDay = { date: string; labels: { label: string; calls: number; tokens: number; seconds: number }[] };
export type AdminOverview = { events: EventSummary[]; flagged: FlaggedQuestion[]; target: number; aiReady: boolean; model: string; usage?: UsageDay[] };

export type StudyNotes = { content: string; updated: string };

export type ReadinessRow = {
  eventId: string; eventName: string; category: string;
  members: number; answered: number; accuracy: number | null;
  byLevel: Record<Level, { tests: number; avg: number | null; best: number | null }>;
};

/* ---------- Presentation judge ---------- */

export type Criterion = { name: string; points: number; description: string };

export type JudgeEvent = {
  id: string; name: string; category: string; guide: string; ready: boolean; kind: 'presentation' | 'roleplay';
  presentMin: number; qaMin: number; prepMin: number; format: string; note: string;
  attempts: number; best: number | null; last: number | null;
};

export type PresentAttemptRow = { id: string; title: string; submitted: string; pct: number; score: number; max: number; seconds: number };

export type JudgeEventDetail = JudgeEvent & { criteria: Criterion[]; indicators: string[]; history: PresentAttemptRow[] };

export type Scenario = { title: string; background: string; yourRole: string; judgeRole: string; task: string; indicators: string[] };

export type Transcript = { text: string; duration: number; words: number; wpm: number; fillers: number; pauses: number };

export type CriterionScore = { name: string; max: number; points: number | null; judged: boolean; evidence: string; feedback: string };

export type PresentResult = {
  id: string; eventId: string; eventName: string; title: string; submitted: string;
  seconds: number; limitSeconds: number; words: number; wpm: number; fillers: number; pauses: number;
  score: number; max: number; pct: number; criteria: CriterionScore[];
  strengths: string[]; improvements: string[]; summary: string;
  qa: { q: string; a: string }[]; mode: 'voice' | 'typed'; prompt: string; transcript: string;
  kind?: 'presentation' | 'roleplay'; scenario?: Scenario | null; team?: string;
  coverage?: { name: string; covered: boolean; note: string }[];
  interjections?: { q: string; at: number }[];
};
