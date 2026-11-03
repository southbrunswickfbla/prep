import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useData } from '../lib/data';
import { api, errorText } from '../lib/api';
import { mainSite } from '../lib/config';
import { eventMastery, plural, topicMastery } from '../lib/format';
import { Bar, btn, External, Loading, Notice, PageHead } from '../components/Layout';
import type { Mode } from '../types';

export const SESSION_KEY = 'fblaprep.session';

export function EventList() {
  const { data, loading, error } = useData();
  const [q, setQ] = useState('');
  if (loading && !data) return <Loading label="Loading events…" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const query = q.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const list = data.events.filter((e) => words.every((w) => `${e.name} ${e.category}`.toLowerCase().includes(w)));
  const ORDER = ['Objective tests', '9th & 10th grade tests', 'Role play tests', 'Presentation events with a test'];
  const rank = (g: string) => (ORDER.indexOf(g) < 0 ? 99 : ORDER.indexOf(g));
  const groups = [...new Set(list.map((e) => e.category || 'Other'))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return (
    <div className="animate-rise">
      <PageHead
        title="Pick your event"
        sub={<>Every objective test the chapter has set up. Can’t find yours? Ask an officer to add it. Not sure which to take? Use the <External href={mainSite.eventFinder} className={btn.link}>Event Finder</External>.</>}
      />
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events"
        aria-label="Search events"
        className="cut-sm w-full max-w-md border-0 bg-white px-4 py-3 text-[16px] outline-none inset-ring-1 inset-ring-line focus:inset-ring-2 focus:inset-ring-gold"
      />
      {data.events.length === 0 && <div className="mt-8"><Notice>No events are set up yet. An officer can add them on the Admin page.</Notice></div>}
      {data.events.length > 0 && list.length === 0 && <p className="mt-8 text-ink-2">No events match “{q}”.</p>}
      {groups.map((g) => (
        <section key={g} className="mt-10">
          <h2 className="font-semiwide text-[15px] font-extrabold text-ink-2">{g}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {list.filter((e) => (e.category || 'Other') === g).map((e) => {
              const m = eventMastery(data.mastery, e.id);
              const ready = e.topics.length > 0;
              return (
                <Link key={e.id} to={`/practice/${e.id}`} className={`cut group block bg-white p-5 transition hover:bg-navy-100/40 ${ready ? '' : 'opacity-60'}`}>
                  <div className="font-semiwide text-[17px] font-extrabold text-navy-950 group-hover:text-blue">{e.name}</div>
                  <div className="mt-1 text-[14px] text-ink-2">
                    {ready ? `${plural(e.topics.length, 'topic')}, ${plural(e.bank, 'question')} so far` : 'Not set up yet'}
                  </div>
                  {m.pct !== null && <div className="mt-3 flex items-center gap-3"><Bar pct={m.pct} /><span className="w-12 text-right text-[14px] font-bold">{m.pct}%</span></div>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function EventDetail() {
  const { eventId = '' } = useParams();
  const [params] = useSearchParams();
  const { data, loading, error } = useData();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string>('');
  const [startError, setStartError] = useState('');
  const auto = useRef(false);

  const event = data?.events.find((e) => e.id === eventId);
  const practiced = useMemo(() => (data && event ? eventMastery(data.mastery, event.id).attempts : 0), [data, event]);

  async function start(mode: Mode, topic?: string) {
    if (!event) return;
    setStarting(mode + (topic || '')); setStartError('');
    try {
      const res = await api.start(event.id, mode, topic);
      if (!res.questions.length) throw new Error('There aren’t any questions for this yet. Try again in a few minutes.');
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ start: res, answers: {}, checked: {}, review: [], index: 0, startedAt: Date.now() }));
      navigate('/session');
    } catch (e) {
      setStartError(errorText(e)); setStarting('');
    }
  }

  // Links like /practice/intro-it?go=weak start right away.
  useEffect(() => {
    const go = params.get('go');
    if (event && !auto.current && (go === 'weak' || go === 'drill')) { auto.current = true; void start(go); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;
  if (!event) return <Notice tone="bad">That event isn’t available. <Link to="/practice" className={btn.link}>See all events</Link></Notice>;

  const fullSize = Math.min(100, event.bank);
  const ready = event.topics.length > 0;
  const modes: { mode: Mode; title: string; body: string; note?: string }[] = [
    { mode: 'drill', title: 'Quick drill', body: '10 questions from every topic. See right away if you got each one right, with an explanation.' },
    { mode: 'weak', title: 'Weak-spot drill', body: '10 questions, mostly from the topics you miss most.', note: practiced ? undefined : 'Do a quick drill first so it knows your weak spots.' },
    { mode: 'full', title: 'Full practice test', body: '100 questions in 50 minutes, split across topics like the real test. Results at the end.', note: event.bank < 100 ? `Only ${plural(event.bank, 'question')} written so far, so you’d get ${fullSize} with time to match.` : undefined },
  ];

  return (
    <div className="animate-rise">
      <Link to="/practice" className="text-[14px] font-bold text-ink-2 hover:text-navy-950">All events</Link>
      <div className="mt-3">
        <PageHead
          title={event.name}
          sub={<>{event.category}. Topics come from FBLA’s {event.guide ? <External href={event.guide} className={btn.link}>official 2026–27 guidelines</External> : 'official guidelines'}. Study links are on the <External href={mainSite.competitions(event.name)} className={btn.link}>chapter site</External>.</>}
        />
      </div>

      {!ready && <Notice>This event isn’t set up yet. An officer needs to add its topics on the Admin page.</Notice>}
      {startError && <div className="mb-6"><Notice tone="bad">{startError}</Notice></div>}
      {starting && <div className="mb-6"><Notice tone="gold">Getting your questions ready. If the AI has to write new ones, this can take up to 30 seconds.</Notice></div>}

      {ready && (
        <div className="grid gap-4 md:grid-cols-3">
          {modes.map((m) => (
            <div key={m.mode} className={`cut flex flex-col p-6 ${m.mode === 'full' ? 'bg-navy-900 text-white' : 'bg-white'}`}>
              <h2 className={`font-semiwide text-xl font-extrabold ${m.mode === 'full' ? 'text-gold' : 'text-navy-950'}`}>{m.title}</h2>
              <p className={`mt-2 flex-1 text-[15px] ${m.mode === 'full' ? 'text-navy-100' : 'text-ink-2'}`}>{m.body}</p>
              {m.note && <p className={`mt-3 text-[14px] font-semibold ${m.mode === 'full' ? 'text-gold-300' : 'text-navy-700'}`}>{m.note}</p>}
              <button
                className={`${m.mode === 'full' ? btn.gold : btn.navy} mt-5`}
                disabled={!!starting || (m.mode === 'weak' && !practiced) || (m.mode === 'full' && event.bank < 10)}
                onClick={() => start(m.mode)}
              >
                {starting === m.mode ? 'Starting…' : 'Start'}
              </button>
            </div>
          ))}
        </div>
      )}

      {ready && (
        <section className="mt-12">
          <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Topics</h2>
          <p className="mt-1 text-ink-2">The knowledge areas FBLA lists for this test. Drill any one on its own.</p>
          <div className="cut mt-4 divide-y divide-line bg-white">
            {event.topics.map((t) => {
              const m = topicMastery(data.mastery, event.id, t.name);
              return (
                <div key={t.name} className="grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_200px_auto]">
                  <div>
                    <div className="font-bold text-navy-950">{t.name}</div>
                    <div className="text-[13px] text-ink-2">{t.items ? `${t.items} questions on the real test, ` : t.weight ? `${t.weight}% of the test, ` : ''}{plural(event.bankByTopic[t.name] || 0, 'practice question')} written</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Bar pct={m.pct} />
                    <span className="w-24 text-right text-[13px] font-bold text-ink-2">{m.pct === null ? 'Not tried' : `${m.pct}% of ${m.attempts}`}</span>
                  </div>
                  <button className={btn.quiet} disabled={!!starting} onClick={() => start('drill', t.name)}>
                    {starting === 'drill' + t.name ? 'Starting…' : 'Drill'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
