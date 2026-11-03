import { API_URL, DEMO } from './config';
import { demoCall } from './demo';
import type { AdminOverview, Dashboard, Mode, Results, StartRes, Topic } from '../types';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'error') {
    super(message);
    this.code = code;
  }
}

let getToken: () => string | null = () => null;
let onAuthError: () => void = () => {};

/** Called once by the auth provider so every request carries the Google sign-in token. */
export function connectAuth(tokenGetter: () => string | null, authErrorHandler: () => void) {
  getToken = tokenGetter;
  onAuthError = authErrorHandler;
}

type Envelope = { ok: boolean; data?: unknown; error?: string; code?: string };

export async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (DEMO) return (await demoCall(action, payload)) as T;
  let res: Response;
  try {
    // text/plain keeps this a "simple" request, so Apps Script doesn't need a CORS preflight.
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken: getToken(), ...payload }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('Can’t reach FBLA Prep right now. Check your internet connection and try again.', 'network');
  }
  let body: Envelope;
  try {
    body = (await res.json()) as Envelope;
  } catch {
    throw new ApiError('FBLA Prep sent back an unexpected reply. Try again in a minute.', 'bad_response');
  }
  if (!body.ok) {
    if (body.code === 'auth') onAuthError();
    throw new ApiError(body.error || 'Something went wrong. Try again.', body.code || 'error');
  }
  return body.data as T;
}

export const api = {
  dashboard: () => call<Dashboard>('dashboard'),
  start: (eventId: string, mode: Mode, topic?: string) => call<StartRes>('start', { eventId, mode, topic }),
  submit: (sessionId: string, answers: Record<string, number>, seconds: number) =>
    call<Results>('submit', { sessionId, answers, seconds }),
  results: (sessionId: string) => call<Results>('results', { sessionId }),
  flag: (questionId: string, reason: string) => call<{ hidden: boolean }>('flag', { questionId, reason }),
  admin: {
    overview: () => call<AdminOverview>('adminOverview'),
    addEvents: (names: string[]) => call<{ added: number }>('addEvents', { names }),
    saveEvent: (event: { id: string; name: string; category: string; topics: Topic[]; active: boolean }) =>
      call<{ saved: boolean }>('saveEvent', { event }),
    deleteEvent: (id: string) => call<{ deleted: boolean }>('deleteEvent', { id }),
    suggestTopics: (name: string, guideText: string) => call<{ topics: Topic[] }>('suggestTopics', { name, guideText }),
    generate: (eventId: string, topic: string, count: number) =>
      call<{ added: number }>('generate', { eventId, topic, count }),
    setQuestionStatus: (id: string, status: 'active' | 'hidden' | 'deleted') =>
      call<{ saved: boolean }>('setQuestionStatus', { id, status }),
  },
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Try again.';
}
