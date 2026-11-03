/**
 * Demo mode: runs entirely in the browser with a small set of sample questions,
 * so the site can be previewed before the Apps Script backend is connected.
 * It follows the same rules as the real backend (Code.gs).
 */
import type { AdminOverview, Dashboard, EventSummary, Mode, Question, Results, SessionRow, StartRes, Topic } from '../types';

type Q = { id: string; eventId: string; topic: string; stem: string; choices: string[]; answer: number; explanation: string };
type Ev = { id: string; name: string; category: string; topics: Topic[] };

const EVENTS: Ev[] = [
  {
    id: 'intro-it', name: 'Introduction to Information Technology', category: '9th & 10th grade tests',
    topics: [
      { name: 'Hardware and devices', weight: 20 },
      { name: 'Networking and the internet', weight: 25 },
      { name: 'Software and operating systems', weight: 20 },
      { name: 'Security and safety', weight: 20 },
      { name: 'Data and databases', weight: 15 },
    ],
  },
  {
    id: 'personal-finance', name: 'Personal Finance', category: 'Objective tests',
    topics: [
      { name: 'Earning income', weight: 25 },
      { name: 'Banking and credit', weight: 25 },
      { name: 'Saving and investing', weight: 30 },
      { name: 'Budgeting and spending', weight: 20 },
    ],
  },
];

const RAW: [string, string, string, string[], number, string][] = [
  ['intro-it', 'Hardware and devices', 'Which component holds the data and programs the CPU is using right now, and loses its contents when the power goes off?', ['RAM', 'Solid-state drive', 'ROM', 'Optical drive'], 0, 'RAM is volatile working memory. Drives and ROM keep their contents without power.'],
  ['intro-it', 'Hardware and devices', 'How many bits are in one byte?', ['8', '4', '16', '1,024'], 0, 'A byte is 8 bits. Half a byte, 4 bits, is called a nibble.'],
  ['intro-it', 'Hardware and devices', 'Which of these is an input device?', ['Scanner', 'Monitor', 'Printer', 'Speaker'], 0, 'A scanner sends data into the computer. Monitors, printers, and speakers present output.'],
  ['intro-it', 'Hardware and devices', 'What is the main job of a motherboard?', ['Connecting the computer’s components so they can communicate', 'Storing files permanently', 'Displaying images on the screen', 'Cooling the processor'], 0, 'The motherboard is the main circuit board that links the CPU, memory, storage, and expansion cards.'],
  ['intro-it', 'Hardware and devices', 'A processor’s clock speed is measured in which unit?', ['Gigahertz (GHz)', 'Gigabytes (GB)', 'Megapixels (MP)', 'Megabits per second (Mbps)'], 0, 'Clock speed is cycles per second, measured in hertz. Gigabytes measure storage, and Mbps measures data transfer.'],
  ['intro-it', 'Networking and the internet', 'Which device forwards data between different networks, such as a home network and the internet?', ['Router', 'Hub', 'Switch', 'Repeater'], 0, 'Routers connect separate networks and choose where traffic goes. Switches and hubs connect devices within one network.'],
  ['intro-it', 'Networking and the internet', 'What does DNS do?', ['Translates domain names like fbla.org into IP addresses', 'Assigns IP addresses to devices automatically', 'Encrypts web traffic', 'Blocks unauthorized traffic'], 0, 'DNS is the internet’s phone book. DHCP assigns addresses, and firewalls block traffic.'],
  ['intro-it', 'Networking and the internet', 'Which IP address is the loopback address that refers to your own computer?', ['127.0.0.1', '192.168.0.1', '255.255.255.0', '8.8.8.8'], 0, '127.0.0.1 always points back to the local machine. 255.255.255.0 is a common subnet mask.'],
  ['intro-it', 'Networking and the internet', 'Which kind of network covers a small area, such as a single school building?', ['LAN', 'WAN', 'MAN', 'The internet'], 0, 'A local area network covers a building or campus. A WAN spans cities or countries.'],
  ['intro-it', 'Networking and the internet', 'Which protocol makes delivery reliable by confirming packets arrived and resending lost ones?', ['TCP', 'UDP', 'IP', 'DNS'], 0, 'TCP checks for delivery and resends missing data. UDP is faster but doesn’t guarantee delivery.'],
  ['intro-it', 'Software and operating systems', 'Which of these is an operating system?', ['Linux', 'Microsoft Word', 'Google Chrome', 'Adobe Photoshop'], 0, 'Linux manages the computer’s hardware and runs other programs. The others are applications.'],
  ['intro-it', 'Software and operating systems', 'Software whose source code anyone can view, change, and share is called what?', ['Open source', 'Shareware', 'Proprietary', 'Freeware'], 0, 'Open-source code is public. Freeware costs nothing, but its code is usually private.'],
  ['intro-it', 'Software and operating systems', 'Which program translates an entire high-level program into machine code before it runs?', ['Compiler', 'Interpreter', 'Debugger', 'Text editor'], 0, 'A compiler translates the whole program ahead of time. An interpreter translates line by line as it runs.'],
  ['intro-it', 'Software and operating systems', 'What is a device driver?', ['Software that lets the operating system communicate with a piece of hardware', 'A cable that connects a printer', 'A program that removes viruses', 'The chip that starts the computer'], 0, 'Drivers translate the operating system’s instructions into commands a specific device understands.'],
  ['intro-it', 'Security and safety', 'An email that pretends to be from your bank and asks you to “verify your password” is an example of what?', ['Phishing', 'Spam filtering', 'Encryption', 'A firewall'], 0, 'Phishing tricks people into giving up information by posing as a trusted source.'],
  ['intro-it', 'Security and safety', 'Which password is strongest?', ['T7#rq!vL2m@Ke', 'password123', 'FBLA2026', 'Jordan2010'], 0, 'Long, random mixes of letters, numbers, and symbols are hardest to guess. Names, years, and common words are easy.'],
  ['intro-it', 'Security and safety', 'Malware that locks your files and demands payment to unlock them is called what?', ['Ransomware', 'Adware', 'Spyware', 'A worm'], 0, 'Ransomware encrypts files and demands a ransom. Spyware secretly collects information.'],
  ['intro-it', 'Security and safety', 'How does two-factor authentication improve security?', ['It requires a second proof of identity, like a code sent to your phone, in addition to a password', 'It makes passwords twice as long', 'It scans files twice for viruses', 'It logs you out after two minutes'], 0, 'Even if someone steals your password, they still need the second factor.'],
  ['intro-it', 'Security and safety', 'Which legal protection applies automatically to original creative work, like code or music, as soon as it is created?', ['Copyright', 'Patent', 'Trademark', 'Trade secret'], 0, 'Copyright protects original works from creation. Patents must be applied for, and trademarks protect brand names and logos.'],
  ['intro-it', 'Data and databases', 'In a relational database, which field uniquely identifies each record in a table?', ['Primary key', 'Foreign key', 'Query', 'Report'], 0, 'Each record has a unique primary key, such as a student ID.'],
  ['intro-it', 'Data and databases', 'A field in one table that refers to the primary key of another table is called what?', ['Foreign key', 'Primary key', 'Index', 'Form'], 0, 'Foreign keys link related tables together.'],
  ['intro-it', 'Data and databases', 'Which spreadsheet formula adds the values in cells A1 through A10?', ['=SUM(A1:A10)', '=ADD(A1-A10)', '=TOTAL(A1,A10)', '=A1+A10'], 0, 'SUM with a range (A1:A10) adds every cell in it. =A1+A10 adds only two cells.'],
  ['intro-it', 'Data and databases', 'Which file format stores a table as plain text, with values separated by commas?', ['CSV', 'PDF', 'JPG', 'DOCX'], 0, 'CSV stands for comma-separated values and opens in any spreadsheet program.'],
  ['personal-finance', 'Earning income', 'What is gross pay?', ['Total pay before taxes and deductions', 'Pay after taxes and deductions', 'Pay from a second job', 'Bonus pay only'], 0, 'Gross pay is everything you earn. Net pay, or take-home pay, is what’s left after deductions.'],
  ['personal-finance', 'Earning income', 'Which form does a new employee fill out so the employer knows how much federal income tax to withhold?', ['Form W-4', 'Form W-2', 'Form 1099', 'Form 1040'], 0, 'The W-4 sets withholding. The W-2 is the yearly wage statement your employer sends you.'],
  ['personal-finance', 'Earning income', 'FICA taxes taken from a paycheck pay for which programs?', ['Social Security and Medicare', 'State income tax', 'Unemployment insurance', 'Public schools'], 0, 'FICA funds Social Security and Medicare.'],
  ['personal-finance', 'Banking and credit', 'Which factor has the largest effect on a FICO credit score?', ['Payment history', 'Length of credit history', 'New credit', 'Credit mix'], 0, 'Paying on time matters most, making up about 35% of a FICO score.'],
  ['personal-finance', 'Banking and credit', 'What does APR stand for?', ['Annual percentage rate', 'Average payment ratio', 'Annual principal return', 'Approved payment rate'], 0, 'APR is the yearly cost of borrowing, including interest and some fees.'],
  ['personal-finance', 'Banking and credit', 'When you pay with a debit card, where does the money come from?', ['Directly from your checking account', 'A line of credit you repay later', 'Your savings bonds', 'Your credit score'], 0, 'Debit cards draw on money you already have. Credit cards borrow money you repay later.'],
  ['personal-finance', 'Saving and investing', 'You deposit $1,000 at 5% interest, compounded once a year. How much is in the account after 2 years?', ['$1,102.50', '$1,100.00', '$1,050.00', '$1,105.00'], 0, 'Year 1: $1,000 × 1.05 = $1,050. Year 2: $1,050 × 1.05 = $1,102.50, because interest is earned on interest.'],
  ['personal-finance', 'Saving and investing', 'Which of these usually has the highest risk and the highest potential return over time?', ['Stocks', 'A savings account', 'Certificates of deposit', 'U.S. government bonds'], 0, 'Stock prices swing more, but stocks have historically earned more over long periods.'],
  ['personal-finance', 'Saving and investing', 'What does the Rule of 72 estimate?', ['How many years it takes an investment to double', 'How much tax you owe on interest', 'The best age to retire', 'Your credit score'], 0, 'Divide 72 by the yearly interest rate. At 8%, money doubles in about 9 years.'],
  ['personal-finance', 'Saving and investing', 'Which of these is insured by the FDIC?', ['A savings account at a bank', 'A mutual fund', 'Shares of stock', 'Cryptocurrency'], 0, 'The FDIC insures bank deposits up to $250,000 per depositor, per bank, per ownership category. Investments are not insured.'],
  ['personal-finance', 'Budgeting and spending', 'Which of these is a fixed expense?', ['Monthly rent', 'Groceries', 'Movie tickets', 'Gas for your car'], 0, 'Fixed expenses stay the same each month. The others change with how much you use or buy.'],
  ['personal-finance', 'Budgeting and spending', 'An emergency fund is usually recommended to cover how much?', ['3 to 6 months of expenses', '1 week of expenses', 'One year’s salary', 'The cost of a new car'], 0, 'Three to six months of expenses covers most surprises, like losing a job.'],
  ['personal-finance', 'Budgeting and spending', 'In the 50/30/20 budget, what does the 20% go to?', ['Savings and paying off debt', 'Needs like rent', 'Wants like entertainment', 'Taxes'], 0, '50% goes to needs, 30% to wants, and 20% to savings and debt repayment.'],
];

const BANK: Q[] = RAW.map(([eventId, topic, stem, choices, answer, explanation], i) => {
  // Shuffle choices so the right answer isn't always first.
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { id: 'demo' + i, eventId, topic, stem, choices: order.map((o) => choices[o]), answer: order.indexOf(answer), explanation };
});

const KEY = 'fblaprep.demo';
type Store = { stats: Record<string, { attempts: number; correct: number; seen: string[] }>; sessions: (SessionRow & { detail: { q: string; c: number | null }[]; seconds: number })[] };
function load(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || '') as Store; } catch { return { stats: {}, sessions: [] }; }
}
function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }
const live = new Map<string, { eventId: string; mode: Mode; qids: string[]; started: number }>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function summary(e: Ev): EventSummary {
  const qs = BANK.filter((q) => q.eventId === e.id);
  const bankByTopic: Record<string, number> = {};
  for (const t of e.topics) bankByTopic[t.name] = qs.filter((q) => q.topic === t.name).length;
  return { ...e, bank: qs.length, bankByTopic };
}
function shuffle<T>(a: T[]): T[] { return a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]); }

function pick(e: Ev, mode: Mode, topic: string | undefined, s: Store): Q[] {
  const size = mode === 'full' ? 100 : 10;
  const pool = BANK.filter((q) => q.eventId === e.id && (!topic || q.topic === topic));
  const weight = (t: Topic) => {
    if (mode !== 'weak') return t.weight || 1;
    const st = s.stats[e.id + '|' + t.name];
    const mastery = st ? (st.correct + 1) / (st.attempts + 2) : 0.5;
    return Math.max(0.05, 1 - mastery);
  };
  if (mode === 'full' || topic) return shuffle(pool).slice(0, size);
  const out: Q[] = [];
  const used = new Set<string>();
  for (let i = 0; i < size; i++) {
    const topics = e.topics.filter((t) => pool.some((q) => q.topic === t.name && !used.has(q.id)));
    if (!topics.length) break;
    const total = topics.reduce((n, t) => n + weight(t), 0);
    let r = Math.random() * total;
    let chosen = topics[0];
    for (const t of topics) { r -= weight(t); if (r <= 0) { chosen = t; break; } }
    const seen = new Set(s.stats[e.id + '|' + chosen.name]?.seen || []);
    const options = shuffle(pool.filter((q) => q.topic === chosen.name && !used.has(q.id)));
    const q = options.find((x) => !seen.has(x.id)) || options[0];
    used.add(q.id); out.push(q);
  }
  return out;
}

function grade(sessionId: string, eventId: string, mode: Mode, qids: string[], answers: Record<string, number>, seconds: number, submitted: string): Results {
  const e = EVENTS.find((x) => x.id === eventId)!;
  const review = qids.map((id) => BANK.find((q) => q.id === id)!).filter(Boolean).map((q) => {
    const chosen = typeof answers[q.id] === 'number' ? answers[q.id] : null;
    return { id: q.id, topic: q.topic, stem: q.stem, choices: q.choices, answer: q.answer, chosen, correct: chosen === q.answer, explanation: q.explanation };
  });
  const byTopic = e.topics.map((t) => ({ topic: t.name, total: review.filter((r) => r.topic === t.name).length, correct: review.filter((r) => r.topic === t.name && r.correct).length })).filter((t) => t.total);
  const correct = review.filter((r) => r.correct).length;
  return { sessionId, eventId, eventName: e.name, mode, total: review.length, correct, pct: review.length ? Math.round((correct / review.length) * 100) : 0, seconds, submitted, byTopic, review };
}

export async function demoCall(action: string, p: Record<string, unknown>): Promise<unknown> {
  await wait(250);
  const s = load();
  switch (action) {
    case 'dashboard': {
      const mastery = Object.entries(s.stats).map(([k, v]) => ({ eventId: k.split('|')[0], topic: k.split('|')[1], attempts: v.attempts, correct: v.correct }));
      const recent = s.sessions.slice(-12).reverse().map(({ detail: _d, seconds: _s, ...row }) => row);
      return { me: { email: 'demo@sbstudents.org', name: 'Demo Member', picture: '', admin: true, staff: false }, events: EVENTS.map(summary), mastery, recent } satisfies Dashboard;
    }
    case 'start': {
      const e = EVENTS.find((x) => x.id === p.eventId);
      if (!e) throw new Error('That event isn’t available.');
      const mode = p.mode as Mode;
      const qs = pick(e, mode, (p.topic as string) || undefined, s);
      const sessionId = 'd' + Date.now().toString(36);
      live.set(sessionId, { eventId: e.id, mode, qids: qs.map((q) => q.id), started: Date.now() });
      const questions: Question[] = qs.map((q) => mode === 'full'
        ? { id: q.id, topic: q.topic, stem: q.stem, choices: q.choices }
        : { id: q.id, topic: q.topic, stem: q.stem, choices: q.choices, answer: q.answer, explanation: q.explanation });
      return { sessionId, mode, eventId: e.id, eventName: e.name, timeLimit: mode === 'full' ? Math.round((qs.length / 100) * 50 * 60) : null, questions, generated: 0 } satisfies StartRes;
    }
    case 'submit': {
      const sess = live.get(p.sessionId as string);
      if (!sess) throw new Error('This practice session expired. Start a new one.');
      const answers = (p.answers || {}) as Record<string, number>;
      const submitted = new Date().toISOString();
      const res = grade(p.sessionId as string, sess.eventId, sess.mode, sess.qids, answers, Number(p.seconds) || 0, submitted);
      for (const r of res.review) {
        const k = sess.eventId + '|' + r.topic;
        const st = s.stats[k] || { attempts: 0, correct: 0, seen: [] };
        st.attempts += 1; if (r.correct) st.correct += 1;
        st.seen = [...st.seen.filter((x) => x !== r.id), r.id].slice(-200);
        s.stats[k] = st;
      }
      s.sessions.push({ id: res.sessionId, eventId: res.eventId, eventName: res.eventName, mode: res.mode, total: res.total, correct: res.correct, pct: res.pct, submitted, seconds: res.seconds, detail: res.review.map((r) => ({ q: r.id, c: r.chosen })) });
      s.sessions = s.sessions.slice(-50);
      save(s); live.delete(p.sessionId as string);
      return res;
    }
    case 'results': {
      const row = s.sessions.find((x) => x.id === p.sessionId);
      if (!row) throw new Error('Those results aren’t available anymore.');
      const answers: Record<string, number> = {};
      for (const d of row.detail) if (d.c !== null) answers[d.q] = d.c;
      return grade(row.id, row.eventId, row.mode, row.detail.map((d) => d.q), answers, row.seconds, row.submitted);
    }
    case 'flag': return { hidden: false };
    case 'adminOverview':
      return { events: EVENTS.map(summary), flagged: [], target: 30, aiReady: false, model: 'Demo mode' } satisfies AdminOverview;
    default:
      throw new Error('Demo mode can’t do that. Connect the backend to use the admin tools.');
  }
}
