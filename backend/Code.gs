/**
 * SBHS FBLA Prep — backend (Google Apps Script), v2.2
 *
 * Paste this into the Apps Script project attached to the "FBLA Prep Data" Google Sheet,
 * save, then run setup() once. Full steps are in SETUP.md.
 *
 * What it does:
 *  - Checks every request's Google sign-in token (school accounts only, optionally members only).
 *  - Has the AI (Gemini, free tier) write practice questions into the Questions tab.
 *  - Builds drills and full practice tests, grades them, and tracks each member's weak topics.
 *  - Tops up every topic's question bank in the background, a few questions at a time.
 *
 * Script properties (Project Settings → Script properties):
 *  GOOGLE_CLIENT_ID      required. The same OAuth client ID as the chapter site.
 *  AI keys: set at least one. With more than one, AI_PROVIDER picks ("groq", "xai", or "gemini").
 *  GROQ_API_KEY          Groq (console.groq.com). Default model openai/gpt-oss-120b, falling back to openai/gpt-oss-20b.
 *  XAI_API_KEY           xAI Grok (console.x.ai). Set XAI_MODEL to a model name from the xAI console.
 *  GEMINI_API_KEY        Google Gemini (aistudio.google.com).
 *  AI_PROVIDER           optional: "groq", "xai", or "gemini". Default: the first key that's set, in that order.
 *  GROQ_MODEL, GROQ_FALLBACK_MODEL, XAI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL: optional model names.
 *  Reading the guidelines PDFs needs the Drive API service: in the editor, Services (+) → Drive API → Add.
 *  ADMIN_EMAILS          comma-separated officer emails that can use the Admin page.
 *  ALLOWED_DOMAINS       default "sbstudents.org,sbschools.org".
 *  STAFF_DOMAIN          default "sbschools.org". Staff can practice and skip the member check.
 *  MEMBER_SHEET_ID       optional. If set, only students on this sheet can sign in.
 *  MEMBER_SHEET_TAB      default "Attendance".
 *  GEMINI_MODEL          default "gemini-flash-latest". Any free-tier text model from AI Studio works.
 *  BANK_TARGET           default 30 questions per topic.
 *  FULL_TEST_SIZE        default 100.   FULL_TEST_MINUTES   default 50.
 *  BANK_MAX_PER_TOPIC    default 120. Drills stop writing new questions for a topic once it has this many.
 *  FLAG_HIDE_AT          default 2 reports before a question is hidden.
 *  TOPUP_BATCHES_PER_RUN default 2 (each batch is one AI call of up to 10 questions).
 *  GEMINI_FALLBACK_MODEL default "gemini-flash-lite-latest". Used when the main model stays overloaded. "none" turns it off.
 *  AI_MIN_GAP_MS        default 6000. Minimum time between AI calls, to stay under the free per-minute limit.
 */

const VERSION = 'v2.2';
const DEFAULT_MODEL = 'gemini-flash-latest';

const TABS = {
  Events:    ['id', 'name', 'category', 'topics', 'active', 'updated', 'guide', 'note'],
  Questions: ['id', 'eventId', 'topic', 'difficulty', 'stem', 'choices', 'answer', 'explanation', 'flags', 'status', 'created', 'source'],
  Stats:     ['email', 'eventId', 'topic', 'attempts', 'correct', 'seen', 'updated', 'missed'],
  Sessions:  ['id', 'email', 'eventId', 'eventName', 'mode', 'total', 'correct', 'pct', 'seconds', 'started', 'submitted', 'detail', 'level'],
  Users:     ['email', 'name', 'firstSeen', 'lastSeen', 'sessions'],
  Flags:     ['time', 'email', 'questionId', 'reason'],
  Notes:     ['eventId', 'topic', 'content', 'updated', 'source'],
};

/*
 * Practice levels. Questions are written at three difficulties, and each level draws a different mix.
 * RCE: fundamentals. SLC: applied. NLC: the hardest, national-level questions.
 */
const LEVELS = {
  rce: { label: 'RCE', mix: { easy: 0.55, medium: 0.45 } },
  slc: { label: 'SLC', mix: { easy: 0.15, medium: 0.6, hard: 0.25 } },
  nlc: { label: 'NLC', mix: { medium: 0.3, hard: 0.7 } },
};
const DIFFICULTY_GUIDE = {
  easy: 'Regional (RCE) level: foundational questions on definitions, key terms, and one-step ideas that a well-prepared first-time competitor should get right.',
  medium: 'State (SLC) level: applied questions, such as short business scenarios, comparing similar concepts, and one- or two-step calculations.',
  hard: 'National (NLC) level: the hardest questions, such as multi-step scenarios and calculations, subtle differences between very plausible choices, and specific terms, laws, and standards from the objectives.',
};
function levelOf(v) { return LEVELS[String(v || '').toLowerCase()] ? String(v).toLowerCase() : 'rce'; }
function diffOf(q) { return ['easy', 'medium', 'hard'].indexOf(q.difficulty) >= 0 ? q.difficulty : 'medium'; }

/* ====================== Web app entry points ====================== */

function doGet() {
  return reply({ ok: true, data: { service: 'FBLA Prep', version: VERSION } });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return reply({ ok: false, code: 'bad_request', error: 'The request couldn’t be read.' });
  }
  try {
    const user = verifyUser(body.idToken);
    return reply({ ok: true, data: route(String(body.action || ''), body, user) });
  } catch (err) {
    const code = err && err.appCode;
    if (!code) console.error((err && err.stack) || err);
    return reply({
      ok: false,
      code: code || 'server',
      error: code ? err.message : 'Something went wrong on the server. Try again in a minute.',
    });
  }
}

function route(action, b, user) {
  switch (action) {
    case 'dashboard': return dashboard(user);
    case 'start': return startSession(user, String(b.eventId || ''), String(b.mode || 'drill'), b.topic ? String(b.topic) : '', levelOf(b.level));
    case 'notes': return studyNotes(user, String(b.eventId || ''), String(b.topic || ''), !!b.regenerate);
    case 'submit': return submitSession(user, String(b.sessionId || ''), b.answers || {}, Number(b.seconds) || 0);
    case 'results': return sessionResults(user, String(b.sessionId || ''));
    case 'flag': return flagQuestion(user, String(b.questionId || ''), String(b.reason || '').slice(0, 200));
  }
  if (!user.admin) throw fail('forbidden', 'Only officers can do that.');
  switch (action) {
    case 'adminOverview': return adminOverview();
    case 'addEvents': return addEvents(Array.isArray(b.names) ? b.names : []);
    case 'saveEvent': return saveEvent(b.event || {});
    case 'deleteEvent': return deleteEvent(String(b.id || ''));
    case 'suggestTopics': return suggestTopics(String(b.name || ''), String(b.guideText || ''));
    case 'generate': return adminGenerate(String(b.eventId || ''), String(b.topic || ''), Number(b.count) || 10);
    case 'setQuestionStatus': return setQuestionStatus(String(b.id || ''), String(b.status || ''));
    case 'loadFbla': return adminLoadFbla(Array.isArray(b.skip) ? b.skip.map(String) : []);
    case 'reloadTopics': return adminReloadTopics(String(b.eventId || ''));
    case 'readiness': return adminReadiness();
  }
  throw fail('bad_request', 'Unknown action.');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail(code, message) {
  const e = new Error(message);
  e.appCode = code;
  return e;
}

/* ====================== Settings ====================== */

function prop(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === '' ? fallback : v;
}
function num(key, fallback) {
  const n = Number(prop(key, ''));
  return isFinite(n) && n > 0 ? n : fallback;
}
function list(key, fallback) {
  return String(prop(key, fallback)).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

/* ====================== Sign-in ====================== */

function verifyUser(idToken) {
  if (!idToken) throw fail('auth', 'Sign in with your school Google account first.');
  const clientId = prop('GOOGLE_CLIENT_ID', '');
  if (!clientId) throw fail('setup', 'Google sign-in isn’t set up on the server. Add GOOGLE_CLIENT_ID.');

  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken);
  const key = 'tok_' + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail('auth', 'Your sign-in expired. Sign in again.');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== clientId) throw fail('auth', 'That sign-in wasn’t made for FBLA Prep. Sign in again.');
  if (String(t.email_verified) !== 'true') throw fail('auth', 'Your Google account’s email isn’t verified.');
  if (Number(t.exp) * 1000 < Date.now()) throw fail('auth', 'Your sign-in expired. Sign in again.');

  const email = String(t.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  const allowed = list('ALLOWED_DOMAINS', 'sbstudents.org,sbschools.org');
  if (allowed.indexOf(domain) < 0) throw fail('domain', 'Use your school Google account (@' + allowed[0] + ').');

  const admin = list('ADMIN_EMAILS', '').indexOf(email) >= 0;
  const staff = domain === String(prop('STAFF_DOMAIN', 'sbschools.org')).toLowerCase();
  if (!admin && !staff && !isMember(email)) {
    throw fail('not_member', 'FBLA Prep is for South Brunswick FBLA members. If you just joined, ask an officer to add you to the membership sheet.');
  }

  const user = { email: email, name: String(t.name || t.given_name || email.split('@')[0]), picture: String(t.picture || ''), admin: admin, staff: staff };
  const ttl = Math.max(60, Math.min(3000, Number(t.exp) - Math.floor(Date.now() / 1000) - 30));
  cache.put(key, JSON.stringify(user), ttl);
  return user;
}

/** When MEMBER_SHEET_ID is set, students must be on the membership sheet (school emails are student IDs). */
function isMember(email) {
  const sheetId = prop('MEMBER_SHEET_ID', '');
  if (!sheetId) return true;
  const cache = CacheService.getScriptCache();
  let ids = cache.get('memberIds');
  if (ids === null) {
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName(prop('MEMBER_SHEET_TAB', 'Attendance'));
    if (!sh) throw fail('setup', 'The membership tab wasn’t found. Check MEMBER_SHEET_TAB.');
    const vals = sh.getDataRange().getDisplayValues();
    let headerRow = -1, col = -1;
    for (let r = 0; r < Math.min(6, vals.length) && col < 0; r++) {
      for (let c = 0; c < vals[r].length; c++) {
        if (/student\s*id/i.test(vals[r][c])) { headerRow = r; col = c; break; }
      }
    }
    if (col < 0) throw fail('setup', 'The membership sheet has no Student ID column.');
    const found = [];
    for (let r = headerRow + 1; r < vals.length; r++) {
      const v = String(vals[r][col]).trim().toLowerCase();
      if (v) found.push(v);
    }
    ids = ',' + found.join(',') + ',';
    try { cache.put('memberIds', ids, 600); } catch (_) { /* too big to cache; fine */ }
  }
  return ids.indexOf(',' + email.split('@')[0] + ',') >= 0;
}

function touchUser(user) {
  const cache = CacheService.getScriptCache();
  const key = 'seen_' + Utilities.base64EncodeWebSafe(user.email).slice(0, 200);
  if (cache.get(key)) return;
  withLock(function () {
    const rows = readAll('Users');
    const ex = rows.filter(function (r) { return r.email === user.email; })[0];
    const now = nowIso();
    if (ex) writeRow('Users', ex._row, { email: user.email, name: user.name, firstSeen: ex.firstSeen, lastSeen: now, sessions: Number(ex.sessions) || 0 });
    else appendRows('Users', [{ email: user.email, name: user.name, firstSeen: now, lastSeen: now, sessions: 0 }]);
  });
  cache.put(key, '1', 3600);
}

/* ====================== Sheet helpers ====================== */

function book() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet(name) {
  let sh = book().getSheetByName(name);
  if (!sh) {
    sh = book().insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Reads a tab as objects. Pass upTo to read only the first N columns (skips big JSON columns). */
function readAll(name, upTo) {
  const sh = sheet(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cols = TABS[name].slice(0, upTo || TABS[name].length);
  const vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const o = { _row: i + 2 };
    for (let j = 0; j < cols.length; j++) {
      const v = vals[i][j];
      o[cols[j]] = v instanceof Date ? v.toISOString() : v;
    }
    out.push(o);
  }
  return out;
}

/** Reads one column of a tab, by name. Lets a page skip a big column that sits before it. */
function readColumn(name, col) {
  const sh = sheet(name);
  const last = sh.getLastRow();
  const idx = TABS[name].indexOf(col);
  if (last < 2 || idx < 0) return [];
  return sh.getRange(2, idx + 1, last - 1, 1).getValues().map(function (r) { return r[0]; });
}

function toCells(name, obj) {
  return TABS[name].map(function (c) {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    // Keep text that starts with = + - @ from turning into a formula.
    if (typeof v === 'string' && /^[=+\-@']/.test(v)) return "'" + v;
    return v;
  });
}
function appendRows(name, objs) {
  if (!objs.length) return;
  const sh = sheet(name);
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, TABS[name].length).setValues(objs.map(function (o) { return toCells(name, o); }));
}
function writeRow(name, row, obj) {
  sheet(name).getRange(row, 1, 1, TABS[name].length).setValues([toCells(name, obj)]);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fail('busy', 'FBLA Prep is busy right now. Try again in a few seconds.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function nowIso() { return new Date().toISOString(); }
function jsonArr(v) { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function shuffled(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
  return b;
}
function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function slug(s) { return norm(s).replace(/ /g, '-').slice(0, 60) || 'event'; }

/* ====================== Events and questions ====================== */

function parseTopics(v) {
  return jsonArr(v).filter(function (t) { return t && t.name; }).map(function (t) {
    const o = { name: String(t.name), weight: Number(t.weight) || 0, objectives: String(t.objectives || '') };
    if (Number(t.items) > 0) o.items = Number(t.items);
    return o;
  });
}
function readEvents(includeInactive) {
  return readAll('Events').filter(function (e) {
    return e.id && (includeInactive || String(e.active).toUpperCase() !== 'FALSE');
  }).map(function (e) {
    return {
      id: String(e.id), name: String(e.name), category: String(e.category || ''), topics: parseTopics(e.topics),
      guide: String(e.guide || ''), note: String(e.note || ''), _row: e._row, active: e.active,
    };
  });
}
function eventRow(e, changes) {
  const o = { id: e.id, name: e.name, category: e.category, topics: JSON.stringify(e.topics), active: e.active === false || String(e.active).toUpperCase() === 'FALSE' ? false : true, updated: nowIso(), guide: e.guide || '', note: e.note || '' };
  Object.keys(changes || {}).forEach(function (k) { o[k] = changes[k]; });
  return o;
}
function qFromRow(r) {
  return {
    id: String(r.id), eventId: String(r.eventId), topic: String(r.topic), difficulty: String(r.difficulty || ''),
    stem: String(r.stem), choices: jsonArr(r.choices).map(String), answer: Number(r.answer),
    explanation: String(r.explanation || ''), flags: Number(r.flags) || 0, status: String(r.status || 'active'), _row: r._row,
  };
}
function readQuestions(eventId) {
  return readAll('Questions').filter(function (r) {
    return r.id && (!eventId || r.eventId === eventId) && r.status !== 'deleted';
  }).map(qFromRow);
}
function eventSummaries(events) {
  const qs = readAll('Questions', 10).filter(function (r) { return r.status === 'active'; });
  return events.map(function (e) {
    const bankByTopic = {};
    let bank = 0;
    e.topics.forEach(function (t) {
      const n = qs.filter(function (q) { return q.eventId === e.id && q.topic === t.name; }).length;
      bankByTopic[t.name] = n;
      bank += n;
    });
    return { id: e.id, name: e.name, category: e.category, topics: e.topics, bank: bank, bankByTopic: bankByTopic, guide: e.guide, note: e.note };
  });
}

/* ====================== Member actions ====================== */

function dashboard(user) {
  touchUser(user);
  const statRows = readAll('Stats').filter(function (r) { return r.email === user.email; });
  const mastery = statRows.map(function (r) {
    return { eventId: String(r.eventId), topic: String(r.topic), attempts: Number(r.attempts) || 0, correct: Number(r.correct) || 0 };
  });
  const missed = {};
  statRows.forEach(function (r) { missed[r.eventId] = (missed[r.eventId] || 0) + jsonArr(r.missed).length; });
  const rows = sessionRowsFor(user.email);
  const bests = {};
  rows.forEach(function (r) {
    if (r.mode !== 'full') return;
    const k = r.eventId + '|' + r.level;
    const b = bests[k] || (bests[k] = { eventId: String(r.eventId), level: r.level, best: 0, count: 0, last: 0, lastAt: '' });
    b.count++;
    b.best = Math.max(b.best, Number(r.pct) || 0);
    if (String(r.submitted) > b.lastAt) { b.lastAt = String(r.submitted); b.last = Number(r.pct) || 0; }
  });
  return {
    me: { email: user.email, name: user.name, picture: user.picture, admin: user.admin, staff: user.staff },
    events: eventSummaries(readEvents()),
    mastery: mastery,
    missed: Object.keys(missed).map(function (k) { return { eventId: k, count: missed[k] }; }).filter(function (m) { return m.count > 0; }),
    bests: Object.keys(bests).map(function (k) { return bests[k]; }),
    recent: rows.sort(function (a, b) { return String(b.submitted).localeCompare(String(a.submitted)); }).slice(0, 30).map(sessionSummary),
  };
}
/** A member's sessions without the big answer column, with each one's level. */
function sessionRowsFor(email) {
  const rows = readAll('Sessions', 11);
  const levels = readColumn('Sessions', 'level');
  return rows.map(function (r, i) { r.level = levelOf(levels[i]); return r; }).filter(function (r) { return r.email === email; });
}
function sessionSummary(r) {
  return { id: String(r.id), eventId: String(r.eventId), eventName: String(r.eventName), mode: String(r.mode), level: levelOf(r.level),
    total: Number(r.total) || 0, correct: Number(r.correct) || 0, pct: Number(r.pct) || 0, submitted: String(r.submitted) };
}

function readStats(email, eventId) {
  const out = {};
  readAll('Stats').forEach(function (r) {
    if (r.email !== email || r.eventId !== eventId) return;
    const seen = {};
    jsonArr(r.seen).forEach(function (id) { seen[id] = true; });
    out[r.topic] = { attempts: Number(r.attempts) || 0, correct: Number(r.correct) || 0, seen: seen, missed: jsonArr(r.missed) };
  });
  return out;
}

/** How many questions to take from each topic. */
function planCounts(topics, size, mode, stats) {
  const w = topics.map(function (t) {
    if (mode === 'weak') {
      const s = stats[t.name];
      const mastery = s ? (s.correct + 1) / (s.attempts + 2) : 0.5;
      return Math.max(0.05, 1 - mastery);
    }
    return t.weight > 0 ? t.weight : 1;
  });
  const total = w.reduce(function (a, b) { return a + b; }, 0);
  const plan = {};
  if (mode === 'full') {
    // Largest-remainder split, so a 100-question test follows the event's test composition.
    const raw = w.map(function (x) { return (x / total) * size; });
    const base = raw.map(Math.floor);
    let left = size - base.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (x, i) { return [x - base[i], i]; }).sort(function (a, b) { return b[0] - a[0]; })
      .forEach(function (p) { if (left > 0) { base[p[1]]++; left--; } });
    topics.forEach(function (t, i) { if (base[i] > 0) plan[t.name] = base[i]; });
    return plan;
  }
  for (let k = 0; k < size; k++) {
    let r = Math.random() * total, i = 0;
    for (; i < w.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
    plan[topics[i].name] = (plan[topics[i].name] || 0) + 1;
  }
  return plan;
}

function startSession(user, eventId, mode, topic, level) {
  if (['drill', 'weak', 'full', 'review'].indexOf(mode) < 0) throw fail('bad_request', 'Unknown practice type.');
  const ev = readEvents().filter(function (e) { return e.id === eventId; })[0];
  if (!ev) throw fail('not_found', 'That event isn’t available.');
  if (!ev.topics.length) throw fail('not_ready', 'This event isn’t set up yet. Ask an officer to load its topics.');
  if (topic && !ev.topics.some(function (t) { return t.name === topic; })) throw fail('not_found', 'That topic isn’t part of this event.');

  let bank = readQuestions(ev.id).filter(function (q) { return q.status === 'active'; });
  const stats = readStats(user.email, ev.id);
  const mix = LEVELS[level].mix;
  let chosen = [];
  let generated = 0;

  if (mode === 'review') {
    // Questions this member got wrong and hasn't answered correctly since.
    const ids = {};
    Object.keys(stats).forEach(function (t) { stats[t].missed.forEach(function (id) { ids[id] = true; }); });
    chosen = shuffled(bank.filter(function (q) { return ids[q.id]; })).slice(0, 10);
    if (!chosen.length) throw fail('nothing_missed', 'No missed questions to review for this event. Nice work.');
  } else {
    const size = mode === 'full' ? num('FULL_TEST_SIZE', 100) : 10;
    const topics = topic ? ev.topics.filter(function (t) { return t.name === topic; }) : ev.topics;
    const plan = planCounts(topics, size, mode, stats);
    const allowed = function (q) { return mix[diffOf(q)] > 0; };

    // Drills: write new questions at this level when a topic is short on ones the member hasn't seen.
    // Usually one AI call, two when topics are nearly empty, so nobody waits long.
    if (mode !== 'full') {
      const cap = num('BANK_MAX_PER_TOPIC', 120);
      const short = Object.keys(plan).map(function (name) {
        const seen = stats[name] ? stats[name].seen : {};
        const inTopic = bank.filter(function (q) { return q.topic === name; });
        const atLevel = inTopic.filter(allowed).length;
        // How many fresh questions of each difficulty this drill wants, versus how many exist.
        let worst = null, missing = 0;
        Object.keys(mix).forEach(function (d) {
          const need = Math.ceil(plan[name] * mix[d]);
          const fresh = inTopic.filter(function (q) { return diffOf(q) === d && !seen[q.id]; }).length;
          const gap = need - fresh;
          if (gap > 0) { missing += gap; if (!worst || gap > worst.gap) worst = { d: d, gap: gap }; }
        });
        return { name: name, missing: missing, difficulty: worst ? worst.d : null, atLevel: atLevel, total: inTopic.length };
      }).filter(function (x) { return x.missing > 0 && (x.atLevel < plan[x.name] || x.total < cap); })
        .sort(function (a, b) { return a.atLevel - b.atLevel || b.missing - a.missing; });
      const urgent = short.filter(function (x) { return x.atLevel < plan[x.name]; });
      (urgent.length ? urgent.slice(0, 2) : short.slice(0, 1)).forEach(function (sh) {
        try {
          const rows = generateQuestions(ev, sh.name, Math.max(sh.missing, 8), sh.difficulty || neediestDifficulty(bank, sh.name, mix));
          generated += rows.length;
          bank = bank.concat(rows.map(qFromRow));
        } catch (err) {
          if (!bank.some(function (q) { return q.topic === sh.name; })) throw err;
        }
      });
    }

    const used = {};
    Object.keys(plan).forEach(function (name) {
      const seen = stats[name] ? stats[name].seen : {};
      const pool = shuffled(bank.filter(function (q) { return q.topic === name; }));
      for (let k = 0; k < plan[name]; k++) {
        const want = pickDifficulty(mix);
        const order = [
          function (q) { return diffOf(q) === want && !seen[q.id]; },
          function (q) { return allowed(q) && !seen[q.id]; },
          function (q) { return allowed(q); },
          function () { return true; },
        ];
        let q = null;
        for (let o = 0; o < order.length && !q; o++) q = pool.filter(function (x) { return !used[x.id] && order[o](x); })[0] || null;
        if (!q) break;
        used[q.id] = true;
        chosen.push(q);
      }
    });
    // If a topic ran short, fill from the other topics.
    if (chosen.length < size) {
      const names = topics.map(function (t) { return t.name; });
      const rest = shuffled(bank.filter(function (q) { return !used[q.id] && names.indexOf(q.topic) >= 0; }));
      rest.sort(function (a, b) { return (allowed(b) ? 1 : 0) - (allowed(a) ? 1 : 0); });
      rest.slice(0, size - chosen.length).forEach(function (q) { chosen.push(q); });
    }
    if (!chosen.length) throw fail('not_ready', mode === 'full' ? 'Questions for this event are still being written. Try a quick drill, which writes new ones on the spot.' : 'No questions are ready for this event yet. Try again in a few minutes.');
  }
  chosen = shuffled(chosen);

  const sessionId = 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
  const timeLimit = mode === 'full' ? Math.round((num('FULL_TEST_MINUTES', 50) * 60 * chosen.length) / num('FULL_TEST_SIZE', 100)) : null;
  CacheService.getScriptCache().put('sess_' + sessionId, JSON.stringify({
    email: user.email, eventId: ev.id, eventName: ev.name, mode: mode, level: level,
    qids: chosen.map(function (q) { return q.id; }), started: nowIso(),
  }), 21600);

  return {
    sessionId: sessionId, mode: mode, level: level, eventId: ev.id, eventName: ev.name, timeLimit: timeLimit, generated: generated,
    questions: chosen.map(function (q) {
      const base = { id: q.id, topic: q.topic, stem: q.stem, choices: q.choices, difficulty: diffOf(q) };
      if (mode !== 'full') { base.answer = q.answer; base.explanation = q.explanation; }
      return base;
    }),
  };
}
function pickDifficulty(mix) {
  let r = Math.random();
  const keys = Object.keys(mix);
  for (let i = 0; i < keys.length; i++) { r -= mix[keys[i]]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}
/** The difficulty this level uses that the topic has fewest questions of, relative to how much the level uses it. */
function neediestDifficulty(bank, topicName, mix) {
  let best = null, bestScore = Infinity;
  Object.keys(mix).forEach(function (d) {
    const n = bank.filter(function (q) { return q.topic === topicName && diffOf(q) === d; }).length;
    const score = n / mix[d];
    if (score < bestScore) { bestScore = score; best = d; }
  });
  return best || 'medium';
}

function submitSession(user, sessionId, answers, seconds) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + sessionId);
  if (!raw) {
    const prior = readAll('Sessions').filter(function (r) { return r.id === sessionId && r.email === user.email; })[0];
    if (prior) return buildResults(prior);
    throw fail('expired', 'This practice session expired. Start a new one.');
  }
  const s = JSON.parse(raw);
  if (s.email !== user.email) throw fail('forbidden', 'This practice session belongs to someone else.');

  const byId = {};
  readQuestions(s.eventId).forEach(function (q) { byId[q.id] = q; });
  const detail = s.qids.filter(function (id) { return byId[id]; }).map(function (id) {
    const c = answers[id];
    return { q: id, c: typeof c === 'number' && c >= 0 && c <= 3 ? c : null };
  });

  let correct = 0;
  const perTopic = {};
  detail.forEach(function (d) {
    const q = byId[d.q];
    const ok = d.c === q.answer;
    if (ok) correct++;
    const t = perTopic[q.topic] || (perTopic[q.topic] = { attempts: 0, correct: 0, ids: [], wrong: [], right: [] });
    t.attempts++;
    if (ok) t.correct++;
    t.ids.push(q.id);
    (ok ? t.right : t.wrong).push(q.id);
  });
  const total = detail.length;
  const row = {
    id: sessionId, email: user.email, eventId: s.eventId, eventName: s.eventName, mode: s.mode,
    total: total, correct: correct, pct: total ? Math.round((correct / total) * 100) : 0,
    seconds: Math.max(0, Math.round(seconds)), started: s.started, submitted: nowIso(), detail: JSON.stringify(detail),
    level: levelOf(s.level),
  };

  withLock(function () {
    const stats = readAll('Stats');
    Object.keys(perTopic).forEach(function (topic) {
      const t = perTopic[topic];
      const ex = stats.filter(function (r) { return r.email === user.email && r.eventId === s.eventId && r.topic === topic; })[0];
      const seen = jsonArr(ex && ex.seen).filter(function (id) { return t.ids.indexOf(id) < 0; }).concat(t.ids).slice(-300);
      // Wrong answers go on the review list; a later right answer takes them off.
      const missed = jsonArr(ex && ex.missed).filter(function (id) { return t.right.indexOf(id) < 0 && t.wrong.indexOf(id) < 0; }).concat(t.wrong).slice(-200);
      const obj = {
        email: user.email, eventId: s.eventId, topic: topic,
        attempts: (ex ? Number(ex.attempts) || 0 : 0) + t.attempts,
        correct: (ex ? Number(ex.correct) || 0 : 0) + t.correct,
        seen: JSON.stringify(seen), updated: nowIso(), missed: JSON.stringify(missed),
      };
      if (ex) writeRow('Stats', ex._row, obj); else appendRows('Stats', [obj]);
    });
    appendRows('Sessions', [row]);
    const u = readAll('Users').filter(function (r) { return r.email === user.email; })[0];
    if (u) writeRow('Users', u._row, { email: u.email, name: user.name, firstSeen: u.firstSeen, lastSeen: nowIso(), sessions: (Number(u.sessions) || 0) + 1 });
  });
  cache.remove('sess_' + sessionId);
  return buildResults(row);
}

function buildResults(row) {
  const byId = {};
  readAll('Questions').forEach(function (r) { if (r.eventId === row.eventId) byId[r.id] = qFromRow(r); });
  const ev = readEvents(true).filter(function (e) { return e.id === row.eventId; })[0];
  const review = jsonArr(row.detail).filter(function (d) { return byId[d.q]; }).map(function (d) {
    const q = byId[d.q];
    return { id: q.id, topic: q.topic, stem: q.stem, choices: q.choices, answer: q.answer, chosen: d.c, correct: d.c === q.answer, explanation: q.explanation };
  });
  const order = ev ? ev.topics.map(function (t) { return t.name; }) : [];
  review.forEach(function (r) { if (order.indexOf(r.topic) < 0) order.push(r.topic); });
  const byTopic = order.map(function (name) {
    const items = review.filter(function (r) { return r.topic === name; });
    return { topic: name, total: items.length, correct: items.filter(function (r) { return r.correct; }).length };
  }).filter(function (t) { return t.total > 0; });
  const correct = review.filter(function (r) { return r.correct; }).length;
  return {
    sessionId: String(row.id), eventId: String(row.eventId), eventName: String(row.eventName), mode: String(row.mode), level: levelOf(row.level),
    total: review.length, correct: correct, pct: review.length ? Math.round((correct / review.length) * 100) : 0,
    seconds: Number(row.seconds) || 0, submitted: String(row.submitted), byTopic: byTopic, review: review,
  };
}

function sessionResults(user, sessionId) {
  const row = readAll('Sessions').filter(function (r) { return r.id === sessionId && (r.email === user.email || user.admin); })[0];
  if (!row) throw fail('not_found', 'Those results aren’t available.');
  return buildResults(row);
}

function flagQuestion(user, questionId, reason) {
  return withLock(function () {
    const flags = readAll('Flags');
    if (flags.some(function (f) { return f.questionId === questionId && f.email === user.email; })) return { hidden: false };
    const r = readAll('Questions').filter(function (x) { return x.id === questionId; })[0];
    if (!r) throw fail('not_found', 'That question no longer exists.');
    const q = qFromRow(r);
    const count = q.flags + 1;
    const hidden = count >= num('FLAG_HIDE_AT', 2) && q.status === 'active';
    r.flags = count;
    if (hidden) r.status = 'hidden';
    writeRow('Questions', r._row, r);
    appendRows('Flags', [{ time: nowIso(), email: user.email, questionId: questionId, reason: reason || 'No reason given' }]);
    return { hidden: hidden };
  });
}

/* ====================== AI ====================== */

/* ---------- Choosing an AI provider ---------- */

function aiProvider() {
  const want = String(prop('AI_PROVIDER', '')).toLowerCase();
  const has = { groq: !!prop('GROQ_API_KEY', ''), xai: !!prop('XAI_API_KEY', ''), gemini: !!prop('GEMINI_API_KEY', '') };
  if (want && has[want]) return want;
  if (has.groq) return 'groq';
  if (has.xai) return 'xai';
  if (has.gemini) return 'gemini';
  return '';
}
function aiModelLabel() {
  const p = aiProvider();
  if (p === 'groq') return 'Groq: ' + prop('GROQ_MODEL', 'openai/gpt-oss-120b');
  if (p === 'xai') return 'xAI Grok: ' + prop('XAI_MODEL', '(set XAI_MODEL)');
  if (p === 'gemini') return 'Gemini: ' + prop('GEMINI_MODEL', DEFAULT_MODEL);
  return 'none';
}

/**
 * Sends a prompt to whichever AI is set up and returns the parsed JSON reply.
 * input is a string, or (Gemini only) a list of parts that can include a PDF.
 * schema is a Gemini-style schema; for other providers it becomes a JSON Schema.
 */
function aiCall(input, schema, temperature) {
  const p = aiProvider();
  if (!p) throw fail('ai', 'The AI isn’t connected yet. Add GROQ_API_KEY (or XAI_API_KEY or GEMINI_API_KEY) in Script properties.');
  if (p === 'gemini') return gemini(input, schema, temperature);
  const text = typeof input === 'string' ? input : (input || []).map(function (x) { return x.text || ''; }).join('\n');
  return openAiCompatCall(p, text, schema, temperature);
}

/** Groq and xAI both use the OpenAI chat format. */
function openAiCompatCall(provider, text, schema, temperature) {
  const cfg = provider === 'groq'
    ? { url: 'https://api.groq.com/openai/v1/chat/completions', key: prop('GROQ_API_KEY', ''), models: [prop('GROQ_MODEL', 'openai/gpt-oss-120b'), prop('GROQ_FALLBACK_MODEL', 'openai/gpt-oss-20b')], name: 'Groq' }
    : { url: 'https://api.x.ai/v1/chat/completions', key: prop('XAI_API_KEY', ''), models: [prop('XAI_MODEL', '')], name: 'xAI' };
  const models = cfg.models.filter(function (m, i, a) { return m && m !== 'none' && a.indexOf(m) === i; });
  if (!models.length) throw fail('ai', 'Set XAI_MODEL in Script properties to a model name from the xAI console.');
  const wrapped = schema && String(schema.type).toUpperCase() === 'ARRAY';
  const jsonSchema = schema ? toJsonSchema(wrapped ? { type: 'OBJECT', properties: { items: schema }, required: ['items'] } : schema) : null;
  const prompt = text + (wrapped ? '\n\nReturn a JSON object with one key, "items", holding the array.' : '') + '\n\nReply with JSON only.';
  let lastBusy = null, lastLimit = null;
  for (let m = 0; m < models.length; m++) {
    try {
      const out = openAiCompatOnce(cfg, models[m], prompt, jsonSchema, temperature);
      if (wrapped) return out && Array.isArray(out.items) ? out.items : (Array.isArray(out) ? out : (out && Array.isArray(out.questions) ? out.questions : []));
      return out;
    } catch (err) {
      // Groq's limits are per model, so a busy or used-up model can fall back to the next one.
      if (err.appCode === 'ai_limit') { lastLimit = err; continue; }
      if (err.appCode === 'ai_busy' || err.appCode === 'ai_fallback_missing') { lastBusy = err; continue; }
      throw err;
    }
  }
  if (lastLimit && !lastBusy) throw lastLimit;
  throw lastBusy && lastBusy.appCode === 'ai_busy' ? lastBusy : (lastLimit || fail('ai_busy', cfg.name + ' is busy right now. Try again in a few minutes.'));
}

function openAiCompatOnce(cfg, model, prompt, jsonSchema, temperature) {
  let format = jsonSchema ? 'schema' : 'object';
  const waits = [4000, 8000, 15000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    paceAi();
    const body = {
      model: model,
      messages: [
        { role: 'system', content: 'You write accurate study material and practice questions for FBLA high school competitive events. Always reply with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: temperature === undefined ? 0.7 : temperature,
      response_format: format === 'schema' ? { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema: jsonSchema } } : { type: 'json_object' },
    };
    if (/gpt-oss/.test(model)) body.reasoning_effort = 'medium';
    const res = UrlFetchApp.fetch(cfg.url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + cfg.key }, payload: JSON.stringify(body),
    });
    const code = res.getResponseCode();
    const textOut = res.getContentText();
    if (code === 200) {
      const j = JSON.parse(textOut);
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      const content = msg && msg.content;
      if (!content) throw fail('ai', cfg.name + ' didn’t send anything back. Try again.');
      return parseJsonLoose(String(content).replace(/<think>[\s\S]*?<\/think>/g, '').trim());
    }
    if (code === 401 || code === 403) throw fail('ai', 'The ' + cfg.name + ' API key was rejected. Check it in Script properties.');
    if (code === 404 || (code === 400 && /model/i.test(textOut) && /not (found|exist)|decommissioned|does not exist/i.test(textOut))) {
      if (cfg.models.indexOf(model) > 0) throw fail('ai_fallback_missing', 'Fallback model not found.');
      throw fail('ai', 'The model "' + model + '" isn’t available on ' + cfg.name + '. Set a different model name in Script properties.');
    }
    if (code === 400 && format === 'schema') { format = 'object'; continue; } // this model doesn't do strict schemas
    if (code === 429) {
      if (/per day|\(TPD\)|\(RPD\)|daily/i.test(textOut)) throw fail('ai_limit', 'Today’s free ' + cfg.name + ' limit for ' + model + ' is used up. It resets daily, and questions already written still work.');
      if (attempt < 2) { Utilities.sleep(retryAfterMs(res, textOut)); continue; }
      throw fail('ai_busy', 'Too many AI requests this minute. Wait a minute and try again.');
    }
    if (code >= 500) {
      if (attempt < waits.length) { Utilities.sleep(waits[attempt]); continue; }
      throw fail('ai_busy', cfg.name + ' is overloaded right now. Try again in a few minutes.');
    }
    console.error(cfg.name + ' error ' + code + ': ' + textOut.slice(0, 600));
    throw fail('ai', cfg.name + ' returned an error (' + code + '). Try again.');
  }
  throw fail('ai_busy', cfg.name + ' is busy right now. Try again in a few minutes.');
}

/** How long a 429 reply asks us to wait (Retry-After header, or "try again in 12.5s"), capped at 40 seconds. */
function retryAfterMs(res, text) {
  let ms = 0;
  try {
    const h = res.getHeaders() || {};
    const v = h['retry-after'] || h['Retry-After'];
    if (v && isFinite(Number(v))) ms = Number(v) * 1000;
  } catch (_) { /* no headers */ }
  const m = String(text).match(/try again in\s*(?:(\d+)m)?\s*([\d.]+)s/i);
  if (!ms && m) ms = ((Number(m[1]) || 0) * 60 + Number(m[2])) * 1000;
  return Math.min(Math.max(ms + 500, 3000), 40000);
}

/** Turns a Gemini-style schema (OBJECT, STRING, ...) into a strict JSON Schema. */
function toJsonSchema(s) {
  const t = String(s.type || '').toLowerCase();
  if (t === 'object') {
    const props = {};
    Object.keys(s.properties || {}).forEach(function (k) { props[k] = toJsonSchema(s.properties[k]); });
    return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
  }
  if (t === 'array') return { type: 'array', items: toJsonSchema(s.items || { type: 'STRING' }) };
  const out = { type: t === 'integer' ? 'integer' : t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string' };
  if (s.enum) out.enum = s.enum;
  return out;
}

/**
 * Calls Gemini. Free-tier friendly: spaces calls out, waits through "overloaded" (503) replies,
 * honors Google's retry delay on rate limits (429), and falls back to a lighter model when the main one stays busy.
 */
function gemini(input, schema, temperature) {
  const key = prop('GEMINI_API_KEY', '');
  if (!key) throw fail('ai', 'The AI isn’t connected yet. An officer needs to add the Gemini API key.');
  const models = [prop('GEMINI_MODEL', DEFAULT_MODEL)];
  const fallback = prop('GEMINI_FALLBACK_MODEL', 'gemini-flash-lite-latest');
  if (fallback && fallback !== 'none' && fallback !== models[0]) models.push(fallback);
  let lastBusy = null;
  for (let m = 0; m < models.length; m++) {
    try { return geminiOnce(key, models[m], input, schema, temperature, m > 0); }
    catch (err) {
      if (err.appCode === 'ai_busy' || err.appCode === 'ai_fallback_missing') { lastBusy = err; continue; }
      throw err;
    }
  }
  throw (lastBusy && lastBusy.appCode === 'ai_busy') ? lastBusy : fail('ai_busy', 'Google’s AI is overloaded right now. Try again in a few minutes.');
}

function geminiOnce(key, model, input, schema, temperature, isFallback) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  let useSchema = !!schema;
  const waits = [5000, 10000, 15000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    paceAi();
    const config = { temperature: temperature === undefined ? 0.7 : temperature, responseMimeType: 'application/json' };
    if (useSchema) config.responseSchema = schema;
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: typeof input === 'string' ? [{ text: input }] : input }], generationConfig: config }),
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 200) {
      const j = JSON.parse(text);
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const out = parts.map(function (p) { return p.text || ''; }).join('');
      if (!out) throw fail('ai', 'The AI didn’t send anything back. Try again.');
      return parseJsonLoose(out);
    }
    if (/API key not valid|API_KEY_INVALID/.test(text)) throw fail('ai', 'The Gemini API key was rejected. Check GEMINI_API_KEY.');
    if (code === 400 && useSchema) { useSchema = false; continue; }
    if (code === 404 && isFallback) throw fail('ai_fallback_missing', 'Fallback model not found.');
    if (code === 429) {
      const info = rateLimitInfo(text);
      if (info.daily) throw fail('ai_limit', 'Today’s free AI limit is used up. It resets once a day, so try again tomorrow. Questions already written still work.');
      if (attempt < 2) { Utilities.sleep(Math.min(info.delayMs || 15000, 40000)); continue; }
      throw fail('ai_busy', 'Too many AI requests this minute. Wait a minute and try again.');
    }
    if (code >= 500) {
      if (attempt < waits.length) { Utilities.sleep(waits[attempt]); continue; }
      throw fail('ai_busy', 'Google’s AI is overloaded right now. Try again in a few minutes.');
    }
    console.error('Gemini error ' + code + ': ' + text.slice(0, 600));
    if (code === 401 || code === 403) throw fail('ai', 'The Gemini API key was rejected. Check GEMINI_API_KEY.');
    if (code === 404) throw fail('ai', 'The AI model "' + model + '" wasn’t found. Set GEMINI_MODEL to a model listed in AI Studio.');
    throw fail('ai', 'The AI service returned an error (' + code + '). Try again.');
  }
  throw fail('ai_busy', 'Google’s AI is overloaded right now. Try again in a few minutes.');
}

/** Keeps at least AI_MIN_GAP_MS (default 6 seconds) between AI calls, so the free per-minute limit isn't hit. */
function paceAi() {
  const gap = num('AI_MIN_GAP_MS', 6000);
  const cache = CacheService.getScriptCache();
  const last = Number(cache.get('ai_last')) || 0;
  const wait = last + gap - Date.now();
  if (wait > 0) Utilities.sleep(Math.min(wait, gap));
  cache.put('ai_last', String(Date.now()), 120);
}

/** Reads Google's 429 reply: whether it's the daily quota, and how long Google asks us to wait. */
function rateLimitInfo(text) {
  let daily = false, delayMs = 0;
  try {
    const details = ((JSON.parse(text).error || {}).details) || [];
    details.forEach(function (d) {
      if (d.retryDelay) { const sec = parseFloat(String(d.retryDelay)); if (isFinite(sec)) delayMs = Math.round(sec * 1000) + 500; }
      (d.violations || []).forEach(function (v) { if (/PerDay/i.test(String(v.quotaId || ''))) daily = true; });
    });
  } catch (_) {
    daily = /per ?day|PerDay/i.test(text);
  }
  return { daily: daily, delayMs: delayMs };
}

function parseJsonLoose(s) {
  try { return JSON.parse(s); } catch (_) { /* keep trying */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) { /* keep trying */ } }
  const a = s.indexOf('['), o = s.indexOf('{');
  const start = a < 0 ? o : o < 0 ? a : Math.min(a, o);
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (start >= 0 && end > start) { try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { /* fall through */ } }
  throw fail('ai', 'The AI’s reply couldn’t be read. Try again.');
}

/** Has the AI write questions for one topic, checks them, and saves the good ones. Returns the saved rows. */
function generateQuestions(ev, topicName, count, difficulty) {
  const topic = ev.topics.filter(function (t) { return t.name === topicName; })[0] || { name: topicName, weight: 0, objectives: '' };
  const existing = readQuestions(ev.id).filter(function (q) { return q.topic === topicName; });
  const avoid = existing.slice(-40).map(function (q) { return '- ' + q.stem.slice(0, 160); }).join('\n');
  const n = Math.max(1, Math.min(12, Math.round(count)));

  const prompt = [
    'You write practice questions for the FBLA (Future Business Leaders of America) high school competitive event "' + ev.name + '" for the 2026–27 school year.',
    'Write ' + n + ' multiple-choice questions for this topic on the event’s objective test: "' + topic.name + '".',
    topic.objectives ? 'What this topic covers: ' + topic.objectives : '',
    'Match the style of FBLA objective tests: clear, professional, and at a high school level. Mix definitions, short real-world scenarios, and calculations where they fit the topic.',
    difficulty ? 'Difficulty for every question in this set: ' + DIFFICULTY_GUIDE[difficulty] : 'Mix easy, medium, and hard questions.',
    'Rules:',
    '- Exactly 4 answer choices. Exactly one is correct. The other three are believable but clearly wrong to someone who knows the material.',
    '- Never use "all of the above", "none of the above", or "both A and B". Don’t put letters in front of the choices.',
    '- Work out each answer before writing it. Leave out any question you aren’t certain about, and any that depends on facts that change from year to year, like tax limits, current rates, or recent news.',
    '- "answer" is the 0-based position of the correct choice. Vary where the correct choice appears.',
    '- "explanation" is one or two sentences on why the answer is right, plus why a tempting wrong choice is wrong when that helps.',
    avoid ? 'Don’t repeat or closely reword these questions that already exist:\n' + avoid : '',
  ].filter(String).join('\n');

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        stem: { type: 'STRING' },
        choices: { type: 'ARRAY', items: { type: 'STRING' } },
        answer: { type: 'INTEGER' },
        explanation: { type: 'STRING' },
        difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
      },
      required: ['stem', 'choices', 'answer', 'explanation', 'difficulty'],
    },
  };

  const out = aiCall(prompt, schema, 0.8);
  const items = Array.isArray(out) ? out : (out && Array.isArray(out.questions) ? out.questions : []);
  const seen = {};
  existing.forEach(function (q) { seen[norm(q.stem)] = true; });
  const rows = [];
  items.forEach(function (it) {
    if (!it || typeof it.stem !== 'string' || !Array.isArray(it.choices)) return;
    const choices = it.choices.map(function (c) { return String(c).replace(/^\s*[A-Da-d][).:]\s+/, '').trim(); });
    const answer = Number(it.answer);
    if (choices.length !== 4 || choices.some(function (c) { return !c || c.length > 300; })) return;
    const distinct = {};
    choices.forEach(function (c) { distinct[c.toLowerCase()] = true; });
    if (Object.keys(distinct).length !== 4) return;
    if (!(answer >= 0 && answer <= 3) || Math.floor(answer) !== answer) return;
    if (/(all|none) of the above|both [a-d] and [a-d]/i.test(choices.join(' | '))) return;
    const stem = it.stem.trim();
    if (stem.length < 10 || stem.length > 700) return;
    const k = norm(stem);
    if (seen[k]) return;
    seen[k] = true;
    const order = shuffled([0, 1, 2, 3]);
    rows.push({
      id: 'q' + Utilities.getUuid().replace(/-/g, '').slice(0, 12),
      eventId: ev.id, topic: topic.name,
      difficulty: difficulty || (['easy', 'medium', 'hard'].indexOf(it.difficulty) >= 0 ? it.difficulty : 'medium'),
      stem: stem,
      choices: JSON.stringify(order.map(function (o) { return choices[o]; })),
      answer: order.indexOf(answer),
      explanation: String(it.explanation || '').trim().slice(0, 900),
      flags: 0, status: 'active', created: nowIso(), source: prop('GEMINI_MODEL', DEFAULT_MODEL),
    });
  });
  if (rows.length) withLock(function () { appendRows('Questions', rows); });
  return rows;
}

/* ====================== Study guides ====================== */

/** A short study guide for one knowledge area, written by the AI once and shared by every member. */
function studyNotes(user, eventId, topicName, regenerate) {
  const ev = readEvents().filter(function (e) { return e.id === eventId; })[0];
  if (!ev) throw fail('not_found', 'That event isn’t available.');
  const topic = ev.topics.filter(function (t) { return t.name === topicName; })[0];
  if (!topic) throw fail('not_found', 'That topic isn’t part of this event.');
  const ex = readAll('Notes').filter(function (r) { return r.eventId === eventId && r.topic === topicName; })[0];
  if (ex && String(ex.content) && !(regenerate && user.admin)) return { content: String(ex.content), updated: String(ex.updated) };

  const prompt = [
    'Write a study guide for high school students preparing for the FBLA (Future Business Leaders of America) 2026–27 "' + ev.name + '" objective test.',
    'Cover this knowledge area from the test: "' + topic.name + '".',
    topic.objectives ? 'What the official guidelines say it covers: ' + topic.objectives : '',
    'Use exactly these sections, as "## " headings: "Key ideas" (6 to 10 bullets, one sentence each), "Terms to know" (bullets written as "**Term**: definition"),',
    '"Example" (one short worked example or business scenario with its answer, when one fits the topic), and "Test traps" (3 to 5 bullets on common mistakes and look-alike answer choices).',
    'Use only "## " headings, "- " bullets, and **bold**. Keep it under 500 words. Stick to well-established facts and skip anything that changes from year to year.',
    'Return JSON: {"content": "<the study guide>"}.',
  ].filter(String).join('\n');
  const out = aiCall(prompt, { type: 'OBJECT', properties: { content: { type: 'STRING' } }, required: ['content'] }, 0.4);
  const content = String((out && out.content) || '').trim().slice(0, 12000);
  if (!content) throw fail('ai', 'The AI didn’t write the study guide. Try again.');
  const updated = nowIso();
  withLock(function () {
    const fresh = readAll('Notes').filter(function (r) { return r.eventId === eventId && r.topic === topicName; })[0];
    const obj = { eventId: eventId, topic: topicName, content: content, updated: updated, source: prop('GEMINI_MODEL', DEFAULT_MODEL) };
    if (fresh) writeRow('Notes', fresh._row, obj); else appendRows('Notes', [obj]);
  });
  return { content: content, updated: updated };
}

/* ====================== Chapter readiness (officers) ====================== */

/** Chapter-wide totals per event, with no member names: who's practicing, accuracy, and full-test scores by level. */
function adminReadiness() {
  const events = readEvents();
  const stats = readAll('Stats', 5);
  const sessions = readAll('Sessions', 11);
  const levels = readColumn('Sessions', 'level');
  sessions.forEach(function (r, i) { r.level = levelOf(levels[i]); });
  return events.map(function (e) {
    const st = stats.filter(function (r) { return r.eventId === e.id && Number(r.attempts) > 0; });
    const people = {};
    st.forEach(function (r) { people[r.email] = true; });
    const attempts = st.reduce(function (n, r) { return n + (Number(r.attempts) || 0); }, 0);
    const correct = st.reduce(function (n, r) { return n + (Number(r.correct) || 0); }, 0);
    const byLevel = {};
    Object.keys(LEVELS).forEach(function (l) {
      const full = sessions.filter(function (r) { return r.eventId === e.id && r.mode === 'full' && r.level === l; });
      byLevel[l] = full.length
        ? { tests: full.length, avg: Math.round(full.reduce(function (n, r) { return n + (Number(r.pct) || 0); }, 0) / full.length), best: Math.max.apply(null, full.map(function (r) { return Number(r.pct) || 0; })) }
        : { tests: 0, avg: null, best: null };
    });
    return { eventId: e.id, eventName: e.name, category: e.category, members: Object.keys(people).length, answered: attempts, accuracy: attempts ? Math.round((correct / attempts) * 100) : null, byLevel: byLevel };
  }).sort(function (a, b) { return b.members - a.members || b.answered - a.answered || a.eventName.localeCompare(b.eventName); });
}

/* ====================== Officer tools ====================== */

function adminOverview() {
  const events = readEvents();
  const names = {};
  readEvents(true).forEach(function (e) { names[e.id] = e.name; });
  const flags = readAll('Flags');
  const flagged = readAll('Questions').filter(function (r) { return Number(r.flags) > 0 && r.status !== 'deleted'; }).map(function (r) {
    const q = qFromRow(r);
    return {
      id: q.id, eventId: q.eventId, eventName: names[q.eventId] || q.eventId, topic: q.topic, stem: q.stem,
      choices: q.choices, answer: q.answer, explanation: q.explanation, flags: q.flags, status: q.status,
      reasons: flags.filter(function (f) { return f.questionId === q.id; }).map(function (f) { return String(f.reason); }),
    };
  });
  return {
    events: eventSummaries(events), flagged: flagged, target: num('BANK_TARGET', 30),
    aiReady: !!aiProvider(), model: aiModelLabel(),
  };
}

function addEvents(names) {
  return withLock(function () {
    const all = readEvents(true);
    const taken = {}, ids = {};
    all.forEach(function (e) { taken[norm(e.name)] = e; ids[e.id] = true; });
    const rows = [];
    let revived = 0;
    names.map(function (n) { return String(n).trim(); }).filter(String).slice(0, 100).forEach(function (name) {
      const ex = taken[norm(name)];
      if (ex) {
        if (String(ex.active).toUpperCase() === 'FALSE') {
          writeRow('Events', ex._row, eventRow(ex, { active: true }));
          revived++;
        }
        return;
      }
      let id = slug(name), i = 2;
      while (ids[id]) id = slug(name) + '-' + i++;
      ids[id] = true;
      taken[norm(name)] = { id: id };
      rows.push({ id: id, name: name, category: '', topics: '[]', active: true, updated: nowIso(), guide: '', note: '' });
    });
    appendRows('Events', rows);
    return { added: rows.length + revived };
  });
}

function cleanTopics(topics) {
  const out = (Array.isArray(topics) ? topics : []).filter(function (t) { return t && String(t.name || '').trim(); }).slice(0, 30).map(function (t) {
    const o = { name: String(t.name).trim().slice(0, 120), weight: Math.max(0, Math.min(100, Math.round(Number(t.weight) || 0))), objectives: String(t.objectives || '').trim().slice(0, 1500) };
    if (Number(t.items) > 0) o.items = Math.round(Number(t.items));
    return o;
  });
  const seen = {};
  return out.filter(function (t) { const k = norm(t.name); if (seen[k]) return false; seen[k] = true; return true; });
}

function saveEvent(ev) {
  const name = String(ev.name || '').trim();
  if (!name) throw fail('bad_request', 'Events need a name.');
  return withLock(function () {
    const ex = readEvents(true).filter(function (e) { return e.id === ev.id; })[0];
    if (!ex) throw fail('not_found', 'That event no longer exists.');
    writeRow('Events', ex._row, eventRow(ex, {
      name: name, category: String(ev.category || '').trim(), topics: JSON.stringify(cleanTopics(ev.topics)),
      active: ev.active === false ? false : true, note: '',
    }));
    return { saved: true };
  });
}

function deleteEvent(id) {
  return withLock(function () {
    const ex = readEvents(true).filter(function (e) { return e.id === id; })[0];
    if (!ex) throw fail('not_found', 'That event no longer exists.');
    writeRow('Events', ex._row, eventRow(ex, { active: false }));
    return { deleted: true };
  });
}

function suggestTopics(name, guideText) {
  if (!name.trim()) throw fail('bad_request', 'Give the event a name first.');
  const text = guideText.trim().slice(0, 20000);
  const prompt = text
    ? [
        'Below is part of the official 2026–27 FBLA competitive event guidelines for "' + name + '".',
        'List the objective test’s topic areas exactly as the guidelines name them, with each one’s share of the test as a whole-number percent, and a short summary of its objectives (under 300 characters).',
        'If the guidelines give question counts instead of percents, convert them to percents. Percents must add up to 100.',
        'Guidelines:\n"""\n' + text + '\n"""',
      ].join('\n')
    : [
        'For the FBLA (Future Business Leaders of America) high school competitive event "' + name + '", list the topic areas its objective test usually covers.',
        'Give 5 to 10 topics, each with a whole-number percent of the test (adding up to 100) and a short summary of what it covers (under 300 characters).',
        'Use the topic names FBLA uses in its guidelines when you know them.',
      ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: {
      topics: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, weight: { type: 'INTEGER' }, objectives: { type: 'STRING' } }, required: ['name', 'weight', 'objectives'] },
      },
    },
    required: ['topics'],
  };
  const out = aiCall(prompt, schema, 0.2);
  const topics = cleanTopics(Array.isArray(out) ? out : out && out.topics);
  if (!topics.length) throw fail('ai', 'The AI didn’t find any topics. Paste more of the guidelines and try again.');
  // Make the weights add up to exactly 100.
  const sum = topics.reduce(function (a, t) { return a + t.weight; }, 0);
  if (sum > 0 && sum !== 100) {
    topics.forEach(function (t) { t.weight = Math.round((t.weight / sum) * 100); });
    topics[0].weight += 100 - topics.reduce(function (a, t) { return a + t.weight; }, 0);
  }
  return { topics: topics };
}

function adminGenerate(eventId, topic, count) {
  const ev = readEvents().filter(function (e) { return e.id === eventId; })[0];
  if (!ev) throw fail('not_found', 'That event isn’t available.');
  if (!ev.topics.some(function (t) { return t.name === topic; })) throw fail('not_found', 'Save the event’s topics first.');
  const bank = readQuestions(ev.id).filter(function (q) { return q.status === 'active'; });
  return { added: generateQuestions(ev, topic, count, neediestDifficulty(bank, topic, { easy: 1, medium: 1, hard: 1 })).length };
}

function setQuestionStatus(id, status) {
  if (['active', 'hidden', 'deleted'].indexOf(status) < 0) throw fail('bad_request', 'Unknown status.');
  return withLock(function () {
    const r = readAll('Questions').filter(function (x) { return x.id === id; })[0];
    if (!r) throw fail('not_found', 'That question no longer exists.');
    r.status = status;
    if (status === 'active') r.flags = 0;
    writeRow('Questions', r._row, r);
    return { saved: true };
  });
}

/* ====================== FBLA 2026–27 tests ====================== */

/*
 * Every 2026–27 high school event with an objective test: the 31 objective tests, the 12 role plays
 * (their test round), and the two presentation events that include a test. Guideline paths match the
 * chapter site's competitiveEvents.ts. To update for a new year, edit this list.
 */
const GUIDE_BASE = 'https://greektrack-fbla-public.s3.us-east-1.amazonaws.com/files/1/High%20School%20Competitive%20Events%20Resources/Individual%20Guidelines/';
const GUIDE_BASE_ALT = 'https://connect.fbla.org/headquarters/files/High%20School%20Competitive%20Events%20Resources/Individual%20Guidelines/';
const FBLA_TESTS = [
  ['Accounting', 'Objective tests', 'Objective%20Tests/Accounting.pdf'],
  ['Advanced Accounting', 'Objective tests', 'Objective%20Tests/Advanced-Accounting.pdf'],
  ['Advertising', 'Objective tests', 'Objective%20Tests/Advertising.pdf'],
  ['Agribusiness', 'Objective tests', 'Objective%20Tests/Agribusiness.pdf'],
  ['Business Communication', 'Objective tests', 'Objective%20Tests/Business-Communication.pdf'],
  ['Business Law', 'Objective tests', 'Objective%20Tests/Business-Law.pdf'],
  ['Computer Problem Solving', 'Objective tests', 'Objective%20Tests/Computer-Problem-Solving.pdf'],
  ['Cybersecurity', 'Objective tests', 'Objective%20Tests/Cybersecurity.pdf'],
  ['Data Science & AI', 'Objective tests', 'Objective%20Tests/Data-Science-and-AI.pdf'],
  ['Economics', 'Objective tests', 'Objective%20Tests/Economics.pdf'],
  ['Healthcare Administration', 'Objective tests', 'Objective%20Tests/Healthcare-Administration.pdf'],
  ['Human Resource Management', 'Objective tests', 'Objective%20Tests/Human-Resource-Management.pdf'],
  ['Insurance & Risk Management', 'Objective tests', 'Objective%20Tests/Insurance-and-Risk-Management.pdf'],
  ['Journalism', 'Objective tests', 'Objective%20Tests/Journalism.pdf'],
  ['Networking Infrastructures', 'Objective tests', 'Objective%20Tests/Networking-Infrastructures.pdf'],
  ['Organizational Leadership', 'Objective tests', 'Objective%20Tests/Organizational-Leadership.pdf'],
  ['Personal Finance', 'Objective tests', 'Objective%20Tests/Personal-Finance.pdf'],
  ['Project Management', 'Objective tests', 'Objective%20Tests/Project-Management.pdf'],
  ['Public Administration & Management', 'Objective tests', 'Objective%20Tests/Public-Administration-and-Management.pdf'],
  ['Real Estate', 'Objective tests', 'Objective%20Tests/Real-Estate.pdf'],
  ['Retail Management', 'Objective tests', 'Objective%20Tests/Retail-Management.pdf'],
  ['Securities & Investments', 'Objective tests', 'Objective%20Tests/Securities-and-Investments.pdf'],
  ['Introduction to Business Communication', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Business-Communication.pdf'],
  ['Introduction to Business Concepts', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Business-Concepts.pdf'],
  ['Introduction to Business Procedures', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Business-Procedures.pdf'],
  ['Introduction to FBLA', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-FBLA.pdf'],
  ['Introduction to Information Technology', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Information-Technology.pdf'],
  ['Introduction to Marketing Concepts', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Marketing-Concepts.pdf'],
  ['Introduction to Parliamentary Procedure', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Parliamentary-Procedure.pdf'],
  ['Introduction to Retail & Merchandising', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Retail-and-Merchandising.pdf'],
  ['Introduction to Supply Chain Management', '9th & 10th grade tests', 'Objective%20Tests/Introduction-to-Supply-Chain-Management.pdf'],
  ['Banking & Financial Systems', 'Role play tests', 'Role%20Play%20Events/Banking-and-Financial-Systems.pdf'],
  ['Business Management', 'Role play tests', 'Role%20Play%20Events/Business-Management.pdf'],
  ['Customer Service', 'Role play tests', 'Role%20Play%20Events/Customer-Service.pdf'],
  ['Entrepreneurship', 'Role play tests', 'Role%20Play%20Events/Entrepreneurship.pdf'],
  ['Hospitality & Event Management', 'Role play tests', 'Role%20Play%20Events/Hospitality-and-Event-Management.pdf'],
  ['International Business', 'Role play tests', 'Role%20Play%20Events/International-Business.pdf'],
  ['Management Information Systems', 'Role play tests', 'Role%20Play%20Events/Management-Information-Systems.pdf'],
  ['Marketing', 'Role play tests', 'Role%20Play%20Events/Marketing.pdf'],
  ['Network Design', 'Role play tests', 'Role%20Play%20Events/Network-Design.pdf'],
  ['Parliamentary Procedure', 'Role play tests', 'Role%20Play%20Events/Parliamentary-Procedure.pdf'],
  ['Sports & Entertainment Management', 'Role play tests', 'Role%20Play%20Events/Sports-and-Entertainment-Management.pdf'],
  ['Technology Support & Services', 'Role play tests', 'Role%20Play%20Events/Technology-Support-and-Services.pdf'],
  ['Business Ethics', 'Presentation events with a test', 'Presentation%20Events/Business-Ethics.pdf'],
  ['Future Business Leader', 'Presentation events with a test', 'Presentation%20Events/Future-Business-Leader.pdf'],
];

/** Adds any FBLA test that isn't in the Events tab yet, and fills in missing guideline links. */
function seedFblaTests() {
  return withLock(function () {
    const all = readEvents(true);
    const byName = {}, ids = {};
    all.forEach(function (e) { byName[norm(e.name)] = e; ids[e.id] = true; });
    const rows = [];
    let linked = 0;
    FBLA_TESTS.forEach(function (t) {
      const guide = GUIDE_BASE + t[2];
      const ex = byName[norm(t[0])];
      if (ex) {
        if (!ex.guide || !ex.category) {
          writeRow('Events', ex._row, eventRow(ex, { guide: ex.guide || guide, category: ex.category || t[1] }));
          linked++;
        }
        return;
      }
      let id = slug(t[0]), i = 2;
      while (ids[id]) id = slug(t[0]) + '-' + i++;
      ids[id] = true;
      rows.push({ id: id, name: t[0], category: t[1], topics: '[]', active: true, updated: nowIso(), guide: guide, note: '' });
    });
    appendRows('Events', rows);
    return { added: rows.length, linked: linked };
  });
}

function fetchGuidePdf(guide) {
  const urls = [guide];
  if (guide.indexOf(GUIDE_BASE) === 0) urls.push(GUIDE_BASE_ALT + guide.slice(GUIDE_BASE.length));
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() !== 200) continue;
      const blob = res.getBlob();
      const head = Utilities.newBlob(blob.getBytes().slice(0, 5)).getDataAsString();
      if (head === '%PDF-') return blob;
    } catch (_) { /* try the next address */ }
  }
  throw fail('guide', 'Couldn’t download the official guidelines for this event.');
}

/** Has the AI read an event's official guidelines PDF and saves its knowledge areas and test-item counts as topics. */
function loadGuideTopics(ev) {
  if (!ev.guide) throw fail('guide', 'This event has no guidelines link.');
  let blob;
  try { blob = fetchGuidePdf(ev.guide); }
  catch (err) { saveNote(ev, 'Couldn’t download the guidelines. Check the link, then try again.'); throw err; }

  // 1. Turn the PDF into text with Google Drive, then read the knowledge areas straight from it (no AI needed).
  let text = '';
  try { text = pdfToText(blob, ev.name); }
  catch (err) { if (err.appCode !== 'no_drive') throw err; }

  let raw = [], expected = 100;
  if (text) {
    const parsed = parseKnowledgeAreas(text);
    raw = parsed.topics;
    expected = parsed.questions || 100;
  }

  // 2. If that didn't work, ask the AI: with the text, or (Gemini only) with the PDF itself.
  if (raw.length < 2) {
    const prompt = [
      (text ? 'Below is the text of' : 'This PDF is') + ' the official FBLA (Future Business Leaders of America) 2026–27 competitive event guidelines for "' + ev.name + '".',
      'Find the objective test’s study guide (the section titled "Study Guide: Knowledge Areas and Objectives").',
      'Return every knowledge area exactly as the guidelines name it, the number of test items shown next to it in parentheses, and a summary of its objectives in your own words (under 300 characters).',
      'Also return the total number of test questions from "Event Elements". If the event has no objective test, return an empty topics list.',
    ].join('\n');
    const schema = {
      type: 'OBJECT',
      properties: {
        topics: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, items: { type: 'INTEGER' }, summary: { type: 'STRING' } }, required: ['name', 'items', 'summary'] } },
        questions: { type: 'INTEGER' },
      },
      required: ['topics', 'questions'],
    };
    let out;
    if (text) out = aiCall(prompt + '\n\nGuidelines:\n"""\n' + text.slice(0, 40000) + '\n"""', schema, 0);
    else if (prop('GEMINI_API_KEY', '')) out = gemini([{ inline_data: { mime_type: 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) } }, { text: prompt }], schema, 0);
    else throw fail('setup', 'Turn on the Drive API service in Apps Script (Services + → Drive API → Add) so FBLA Prep can read the guidelines.');
    raw = (out && Array.isArray(out.topics) ? out.topics : []).filter(function (t) { return t && String(t.name || '').trim(); })
      .map(function (t) { return { name: String(t.name).trim(), items: Math.max(0, Math.round(Number(t.items) || 0)), summary: String(t.summary || '') }; });
    expected = Number(out && out.questions) || 100;
  }

  if (!raw.length) {
    saveNote(ev, 'Couldn’t find test topics in the guidelines. Add them by hand.');
    throw fail('guide', 'No test topics were found in the guidelines for ' + ev.name + '.');
  }
  const total = raw.reduce(function (n, t) { return n + t.items; }, 0);
  const topics = cleanTopics(raw.map(function (t) {
    return { name: t.name, items: t.items, weight: total ? (t.items / total) * 100 : 100 / raw.length, objectives: t.summary };
  }));
  const sum = topics.reduce(function (n, t) { return n + t.weight; }, 0);
  if (topics.length) topics[0].weight += 100 - sum;

  const note = total === expected ? 'Loaded from the 2026–27 guidelines.' : 'Check these: the test items add up to ' + total + ', but the guidelines say ' + expected + ' questions.';
  withLock(function () {
    const fresh = readEvents(true).filter(function (e) { return e.id === ev.id; })[0] || ev;
    writeRow('Events', fresh._row, eventRow(fresh, { topics: JSON.stringify(topics), note: note }));
  });
  return { topics: topics, note: note };
}

/** Converts a PDF to text by making a temporary Google Doc with the Drive API service, then deleting it. */
function pdfToText(blob, name) {
  if (typeof Drive === 'undefined' || !Drive.Files) throw fail('no_drive', 'Drive API service is off.');
  let id = '';
  try {
    blob.setName('FBLA Prep temp - ' + name + '.pdf');
    if (Drive.Files.create) id = Drive.Files.create({ name: 'FBLA Prep temp - ' + name, mimeType: 'application/vnd.google-apps.document' }, blob).id;
    else id = Drive.Files.insert({ title: 'FBLA Prep temp - ' + name, mimeType: 'application/vnd.google-apps.document' }, blob, { convert: true }).id;
    return DocumentApp.openById(id).getBody().getText();
  } finally {
    if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (_) { /* leave it */ } }
  }
}

/**
 * Reads "Knowledge Area Name (30 test items)" lines from the guidelines text, with the objective lines under each.
 * Returns { topics: [{name, items, summary}], questions } or empty topics if the format isn't found.
 */
function parseKnowledgeAreas(text) {
  const all = String(text).replace(/\r/g, '');
  const startAt = Math.max(all.search(/Knowledge Areas and Objectives/i), 0);
  const lines = all.slice(startAt).split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(String);
  const re = /^(.*?)\s*\(\s*(\d{1,3})\s*(?:test\s*)?(?:items?|questions?)\s*\)\s*$/i;
  const topics = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      let name = m[1].replace(/^[\d.\-•▪●\s]+/, '').trim();
      if (!name && i > 0) name = lines[i - 1];
      if (name.length >= 3 && name.length <= 120) {
        current = { name: name, items: Number(m[2]), obj: [] };
        topics.push(current);
        continue;
      }
    }
    if (current && current.obj.join(' ').length < 1100 && !/^page \d+|competitive events guidelines|^©/i.test(lines[i])) {
      current.obj.push(lines[i].replace(/^[\d.\-•▪●o\s]+(?=\S)/, ''));
    }
  }
  const total = topics.reduce(function (n, t) { return n + t.items; }, 0);
  if (topics.length < 2 || total < 20 || total > 200) return { topics: [], questions: 0 };
  const qm = all.match(/(\d{2,3})[\s-]*(?:multiple[\s-]*choice|question)/i);
  return {
    topics: topics.map(function (t) { return { name: t.name, items: t.items, summary: t.obj.join('; ').slice(0, 1200) }; }),
    questions: qm ? Number(qm[1]) : total,
  };
}

function saveNote(ev, note) {
  try {
    withLock(function () {
      const fresh = readEvents(true).filter(function (e) { return e.id === ev.id; })[0];
      if (fresh) writeRow('Events', fresh._row, eventRow(fresh, { note: note }));
    });
  } catch (_) { /* a missing note isn't worth failing over */ }
}

/** Admin: add every FBLA test, then read guidelines for the ones without topics, about 45 seconds per call. */
function adminLoadFbla(skip) {
  const seeded = seedFblaTests();
  CacheService.getScriptCache().put('admin_loading', '1', 180); // the timer waits while an officer is loading
  const started = Date.now();
  const loaded = [], failed = [];
  let busy = false, daily = false, message = '';
  const skipSet = {};
  skip.forEach(function (id) { skipSet[id] = true; });
  const todo = readEvents().filter(function (e) { return e.guide && !e.topics.length && !skipSet[e.id]; });
  for (let i = 0; i < todo.length && Date.now() - started < 40000; i++) {
    try { loadGuideTopics(todo[i]); loaded.push(todo[i].name); }
    catch (err) {
      // Busy or rate-limited: stop this round without marking the event as failed, so it's tried again.
      if (err.appCode === 'ai_busy') { busy = true; message = err.message; break; }
      if (err.appCode === 'ai_limit') { daily = true; message = err.message; break; }
      failed.push({ id: todo[i].id, name: todo[i].name, error: err.appCode ? err.message : 'Something went wrong.' });
    }
  }
  const remaining = readEvents().filter(function (e) {
    return e.guide && !e.topics.length && !skipSet[e.id] && !failed.some(function (f) { return f.id === e.id; });
  }).length;
  return { added: seeded.added, loaded: loaded, failed: failed, remaining: remaining, busy: busy, daily: daily, message: message };
}

function adminReloadTopics(eventId) {
  const ev = readEvents(true).filter(function (e) { return e.id === eventId; })[0];
  if (!ev) throw fail('not_found', 'That event no longer exists.');
  const r = loadGuideTopics(ev);
  return { topics: r.topics, note: r.note };
}

/* ====================== Background top-up and setup ====================== */

/** Runs on a timer. Writes questions for whichever topic has the fewest, until every topic reaches BANK_TARGET. */
function topUpBanks() {
  if (!aiProvider()) return;
  if (CacheService.getScriptCache().get('admin_loading')) return; // an officer is loading tests right now
  const target = num('BANK_TARGET', 30);
  const batches = num('TOPUP_BATCHES_PER_RUN', 2);
  const started = Date.now();
  // First, read the official guidelines for any test that doesn't have topics yet (two per run).
  const waiting = readEvents().filter(function (e) { return e.guide && !e.topics.length && e.note.indexOf('Couldn') !== 0; });
  for (let i = 0; i < Math.min(2, waiting.length); i++) {
    try { loadGuideTopics(waiting[i]); console.log('Loaded topics for ' + waiting[i].name); }
    catch (err) { console.warn('Topics for ' + waiting[i].name + ' failed: ' + err.message); }
  }
  if (waiting.length) return;
  for (let i = 0; i < batches && Date.now() - started < 4 * 60 * 1000; i++) {
    const events = readEvents();
    const qs = readAll('Questions', 10).filter(function (r) { return r.status === 'active'; });
    const per = Math.ceil(target / 3); // a third of each topic's target at each difficulty
    let best = null;
    events.forEach(function (e) {
      e.topics.forEach(function (t) {
        ['easy', 'medium', 'hard'].forEach(function (d) {
          const n = qs.filter(function (q) { return q.eventId === e.id && q.topic === t.name && diffOf(q) === d; }).length;
          if (n < per && (!best || n < best.n)) best = { e: e, t: t, d: d, n: n };
        });
      });
    });
    if (!best) return;
    try {
      const rows = generateQuestions(best.e, best.t.name, Math.min(10, per - best.n), best.d);
      console.log('Wrote ' + rows.length + ' ' + best.d + ' for ' + best.e.name + ' / ' + best.t.name);
    } catch (err) {
      console.warn('Top-up paused: ' + err.message);
      return;
    }
  }
}

/** Run once from the editor: creates the tabs and starts the 10-minute top-up timer. */
function setup() {
  Object.keys(TABS).forEach(function (name) {
    const sh = sheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
  });
  const seeded = seedFblaTests();
  console.log('Added ' + seeded.added + ' FBLA tests to the Events tab. Their topics load from the official guidelines on the timer, or click "Load all tests" on the Admin page.');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'topUpBanks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('topUpBanks').timeBased().everyMinutes(10).create();
  const missing = ['GOOGLE_CLIENT_ID', 'GEMINI_API_KEY', 'ADMIN_EMAILS'].filter(function (k) { return !prop(k, ''); });
  console.log('Tabs ready and the top-up timer is on.' + (missing.length ? ' Still missing script properties: ' + missing.join(', ') : ' All required script properties are set.'));
}

/** Run from the editor to check the AI connection. Writes nothing. */
function testAi() {
  const out = aiCall('Reply with JSON: {"ok": true, "model": "<your model name>"}', null, 0);
  console.log('Using ' + aiModelLabel() + ': ' + JSON.stringify(out));
}
