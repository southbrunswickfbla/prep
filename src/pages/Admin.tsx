import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../lib/api';
import { useData } from '../lib/data';
import { LETTERS, plural } from '../lib/format';
import { btn, External, Loading, Notice, PageHead } from '../components/Layout';
import type { AdminOverview, EventSummary, ReadinessRow, Topic } from '../types';

const input = 'cut-sm w-full bg-paper px-3 py-2.5 text-[15px] outline-none inset-ring-1 inset-ring-line focus:inset-ring-2 focus:inset-ring-gold';

function EventEditor({ ev, target, onChanged }: { ev: EventSummary; target: number; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(ev.name);
  const [category, setCategory] = useState(ev.category);
  const [topics, setTopics] = useState<Topic[]>(ev.topics.length ? ev.topics : []);
  const [guide, setGuide] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);

  useEffect(() => { setName(ev.name); setCategory(ev.category); setTopics(ev.topics); }, [ev]);
  const totalWeight = topics.reduce((n, t) => n + (Number(t.weight) || 0), 0);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label); setMsg(null);
    try { const text = await fn(); if (text) setMsg({ tone: 'info', text }); }
    catch (e) { setMsg({ tone: 'bad', text: errorText(e) }); }
    finally { setBusy(''); }
  }

  const ready = ev.topics.length > 0;
  return (
    <div className="cut bg-white">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="block font-semiwide text-[17px] font-extrabold text-navy-950">{ev.name}</span>
          <span className="text-[13px] text-ink-2">{ev.category || 'No category'}, {ready ? `${plural(ev.topics.length, 'topic')}, ${plural(ev.bank, 'question')}` : 'no topics yet'}</span>
        </span>
        <span className={`cut-sm px-3 py-1 text-[13px] font-black ${!ready ? 'bg-bad-100 text-bad' : ev.bank >= ev.topics.length * target ? 'bg-good-100 text-good' : 'bg-gold-100 text-navy-950'}`}>
          {!ready ? 'Needs topics' : ev.bank >= ev.topics.length * target ? 'Bank full' : 'Filling'}
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-6 pt-5">
          {ev.note && <div className="mb-4"><Notice tone={/^(Check|Couldn)/.test(ev.note) ? 'bad' : 'info'}>{ev.note}</Notice></div>}
          {ev.guide && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <External href={ev.guide} className={btn.link}>Official 2026–27 guidelines</External>
              <button className={btn.quiet} disabled={!!busy} onClick={() => {
                if (ev.topics.length && !window.confirm(`Replace ${ev.name}’s topics with the ones in the official guidelines?`)) return;
                void run('reload', async () => {
                  const r = await api.admin.reloadTopics(ev.id);
                  setTopics(r.topics);
                  await onChanged();
                  return `Loaded ${plural(r.topics.length, 'topic')} from the guidelines.`;
                });
              }}>{busy === 'reload' ? 'Reading the guidelines…' : ev.topics.length ? 'Reload from the guidelines' : 'Load from the guidelines'}</button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-bold text-ink-2">Event name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="grid gap-1 text-[13px] font-bold text-ink-2">Career cluster<input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Finance, Digital Technology…" /></label>
          </div>

          <h3 className="mt-6 font-semiwide text-[16px] font-extrabold text-navy-950">Topics (knowledge areas)</h3>
          <p className="text-[14px] text-ink-2">Weights should add up to 100. They decide how a full practice test is split, matching the real test’s question counts.</p>
          <div className="mt-3 grid gap-2">
            {topics.map((t, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_90px_1.6fr_auto]">
                <input className={input} value={t.name} placeholder="Topic" aria-label="Topic name" onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={input} type="number" min={0} max={100} value={t.weight} aria-label="Weight percent" onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} />
                <input className={input} value={t.objectives || ''} placeholder="Objectives (optional, helps the AI)" aria-label="Objectives" onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, objectives: e.target.value } : x)))} />
                <button className="text-[14px] font-bold text-bad" onClick={() => setTopics(topics.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className={btn.quiet} onClick={() => setTopics([...topics, { name: '', weight: 0, objectives: '' }])}>Add topic</button>
            <span className={`text-[14px] font-bold ${totalWeight === 100 ? 'text-good' : 'text-bad'}`}>Weights total {totalWeight}%</span>
          </div>

          <details className="cut-sm mt-5 bg-paper p-4">
            <summary className="cursor-pointer font-bold text-navy-950">Fill in topics with AI</summary>
            <p className="mt-2 text-[14px] text-ink-2">Paste the test composition and study guide section from this year’s guidelines (linked on the chapter site’s Competitions page) and the AI will pull out the topics, weights, and objectives. Leave it empty to have the AI suggest topics on its own, then check them against the guidelines.</p>
            <textarea className={`${input} mt-3 min-h-28`} value={guide} onChange={(e) => setGuide(e.target.value)} placeholder="Paste from the event guidelines" />
            <button className={`${btn.navy} mt-3`} disabled={!!busy} onClick={() => run('suggest', async () => {
              const r = await api.admin.suggestTopics(name, guide);
              setTopics(r.topics);
              return `Filled in ${plural(r.topics.length, 'topic')}. Check them, then save.`;
            })}>{busy === 'suggest' ? 'Reading…' : guide.trim() ? 'Pull topics from this text' : 'Suggest topics'}</button>
          </details>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className={btn.gold} disabled={!!busy || !name.trim()} onClick={() => run('save', async () => {
              const clean = topics.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), weight: Number(t.weight) || 0, objectives: (t.objectives || '').trim() }));
              await api.admin.saveEvent({ id: ev.id, name: name.trim(), category: category.trim(), topics: clean, active: true });
              await onChanged();
              return 'Saved.';
            })}>{busy === 'save' ? 'Saving…' : 'Save event'}</button>
            <button className="text-[14px] font-bold text-bad" disabled={!!busy} onClick={() => {
              if (!window.confirm(`Delete ${ev.name}? Its questions stay in the sheet but members won’t see the event.`)) return;
              void run('delete', async () => { await api.admin.deleteEvent(ev.id); await onChanged(); });
            }}>Delete event</button>
          </div>

          {ready && (
            <>
              <h3 className="mt-8 font-semiwide text-[16px] font-extrabold text-navy-950">Question bank</h3>
              <p className="text-[14px] text-ink-2">The backend tops up every topic to {target} questions on its own, a few at a time. Write more now if members are waiting.</p>
              <div className="mt-3 divide-y divide-line">
                {ev.topics.map((t) => {
                  const n = ev.bankByTopic[t.name] || 0;
                  return (
                    <div key={t.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span className="text-[15px] font-semibold">{t.name}</span>
                      <span className="flex items-center gap-3">
                        <span className={`text-[14px] font-bold ${n >= target ? 'text-good' : 'text-ink-2'}`}>{n} / {target}</span>
                        <button className={btn.quiet} disabled={!!busy} onClick={() => run('gen' + t.name, async () => {
                          const r = await api.admin.generate(ev.id, t.name, 10);
                          await onChanged();
                          return `Wrote ${plural(r.added, 'question')} for ${t.name}.`;
                        })}>{busy === 'gen' + t.name ? 'Writing…' : 'Write 10 more'}</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        </div>
      )}
    </div>
  );
}

export function Admin() {
  const { data, refresh } = useData();
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState('');
  const [fbla, setFbla] = useState<{ running: boolean; loaded: number; remaining: number | null; failed: { name: string; error: string }[]; error: string } | null>(null);

  async function loadAll() {
    const skip: string[] = [];
    let loaded = 0;
    let failed: { id: string; name: string; error: string }[] = [];
    setFbla({ running: true, loaded: 0, remaining: null, failed: [], error: '' });
    try {
      for (let round = 0; round < 40; round++) {
        const r = await api.admin.loadFbla(skip);
        loaded += r.loaded.length;
        failed = failed.concat(r.failed);
        skip.push(...r.failed.map((f) => f.id));
        const stop = r.remaining === 0 || (r.loaded.length === 0 && r.failed.length === 0) || r.failed.some((f) => /limit/i.test(f.error));
        setFbla({ running: !stop, loaded, remaining: r.remaining, failed, error: '' });
        await load();
        if (stop) break;
      }
    } catch (e) {
      setFbla({ running: false, loaded, remaining: null, failed, error: errorText(e) });
    }
    void refresh();
  }

  const [ready, setReady] = useState<ReadinessRow[] | null>(null);
  const load = useCallback(async () => {
    try { setOv(await api.admin.overview()); setError(''); } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.admin.readiness().then(setReady).catch(() => setReady([])); }, []);
  const changed = useCallback(async () => { await load(); void refresh(); }, [load, refresh]);

  if (data && !data.me.admin) return <Notice tone="bad">The Admin page is for officers. Ask the chapter’s tech officer to add your email to ADMIN_EMAILS.</Notice>;
  if (error && !ov) return <Notice tone="bad">{error}</Notice>;
  if (!ov) return <Loading label="Loading admin tools…" />;

  return (
    <div className="animate-rise">
      <PageHead title="Admin" sub="Set up events and topics, keep the question bank full, and review questions members reported." />
      {!ov.aiReady && <div className="mb-6"><Notice tone="bad">The AI isn’t connected. Add GEMINI_API_KEY in the Apps Script project’s Script properties.</Notice></div>}
      {ov.aiReady && <p className="mb-6 text-[14px] text-ink-2">AI model: <b>{ov.model}</b>. Bank target: {ov.target} questions per topic.</p>}

      <section className="cut bg-navy-900 p-6 text-white">
        <h2 className="font-semiwide text-xl font-extrabold text-gold">FBLA 2026–27 tests</h2>
        <p className="mt-1 max-w-[70ch] text-[15px] text-navy-100">
          Adds all 45 events that have an objective test (31 objective tests, 12 role plays, Business Ethics, and Future Business Leader).
          The AI reads each one’s official guidelines and saves its knowledge areas and question counts. Then questions start writing on their own.
        </p>
        <p className="mt-3 text-[14px] font-bold text-gold-300">
          {ov.events.filter((e) => e.guide && e.topics.length).length} of {ov.events.filter((e) => e.guide).length || 45} tests have their topics.
        </p>
        <button className={`${btn.gold} mt-4`} disabled={!!fbla?.running} onClick={() => void loadAll()}>
          {fbla?.running ? 'Reading the guidelines…' : 'Load all tests from the guidelines'}
        </button>
        {fbla && (
          <div className="mt-4 grid gap-2">
            <Notice tone={fbla.error ? 'bad' : 'gold'}>
              {fbla.error || (fbla.running
                ? `Read ${plural(fbla.loaded, 'event')} so far${fbla.remaining !== null ? `, ${fbla.remaining} to go` : ''}. This takes about 15 seconds per event. Keep this page open.`
                : `Done. Read ${plural(fbla.loaded, 'event')}.${fbla.remaining ? ` ${fbla.remaining} still need topics; the timer will keep going in the background, or click the button again.` : ''}`)}
            </Notice>
            {fbla.failed.length > 0 && (
              <Notice tone="bad">
                {fbla.failed.map((f) => `${f.name}: ${f.error}`).join(' ')} Open those events below to try again or add topics by hand.
              </Notice>
            )}
          </div>
        )}
      </section>

      <section className="cut mt-6 bg-white p-6">
        <h2 className="font-semiwide text-xl font-extrabold text-navy-950">Add other events</h2>
        <p className="mt-1 text-[14px] text-ink-2">Only needed for events that aren’t one of the 45 above. One name per line, then open each one below and add its topics.</p>
        <textarea className={`${input} mt-3 min-h-28`} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Event name'} />
        <button className={`${btn.navy} mt-3`} disabled={!!busy || !names.trim()} onClick={async () => {
          setBusy('add');
          try { const r = await api.admin.addEvents(names.split('\n').map((s) => s.trim()).filter(Boolean)); setNames(''); await changed(); setError(r.added ? '' : 'Those events already exist.'); }
          catch (e) { setError(errorText(e)); }
          finally { setBusy(''); }
        }}>{busy === 'add' ? 'Adding…' : 'Add events'}</button>
        {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      </section>

      <section className="mt-10">
        <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Chapter readiness</h2>
        <p className="mt-1 text-[14px] text-ink-2">Totals across members, with no names. Full-test scores show the average and best at each level.</p>
        {!ready ? <Loading label="Adding up practice…" /> : ready.filter((r) => r.members > 0).length === 0 ? (
          <p className="mt-4 text-ink-2">Nobody has practiced yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse bg-white text-left text-[14px]">
              <thead><tr className="bg-navy-900 text-white">
                <th className="px-4 py-3 font-bold">Event</th>
                <th className="px-4 py-3 text-right font-bold">Members</th>
                <th className="px-4 py-3 text-right font-bold">Answered</th>
                <th className="px-4 py-3 text-right font-bold">Accuracy</th>
                {(['RCE', 'SLC', 'NLC'] as const).map((l) => <th key={l} className="px-4 py-3 text-right font-bold">{l} tests</th>)}
              </tr></thead>
              <tbody>
                {ready.filter((r) => r.members > 0).map((r) => (
                  <tr key={r.eventId} className="border-b border-line">
                    <td className="px-4 py-3 font-bold text-navy-950">{r.eventName}</td>
                    <td className="px-4 py-3 text-right">{r.members}</td>
                    <td className="px-4 py-3 text-right">{r.answered}</td>
                    <td className="px-4 py-3 text-right font-bold">{r.accuracy === null ? '–' : `${r.accuracy}%`}</td>
                    {(['rce', 'slc', 'nlc'] as const).map((l) => {
                      const b = r.byLevel[l];
                      return <td key={l} className="px-4 py-3 text-right text-ink-2">{b.tests ? `${b.avg}% avg, ${b.best}% best (${b.tests})` : '–'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Events ({ov.events.length})</h2>
        <div className="mt-4 grid gap-3">
          {ov.events.map((ev) => <EventEditor key={ev.id} ev={ev} target={ov.target} onChanged={changed} />)}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-semiwide text-2xl font-extrabold text-navy-950">Reported questions ({ov.flagged.length})</h2>
        <p className="mt-1 text-[14px] text-ink-2">A question is hidden from members after two reports. Restore it if it’s fine, or delete it.</p>
        {ov.flagged.length === 0 && <p className="mt-4 text-ink-2">Nothing reported.</p>}
        <div className="mt-4 grid gap-4">
          {ov.flagged.map((q) => (
            <div key={q.id} className="cut bg-white p-6">
              <div className="text-[13px] font-bold text-blue">{q.eventName}, {q.topic}. {plural(q.flags, 'report')}{q.status === 'hidden' ? ', hidden' : ''}</div>
              <p className="mt-2 font-semiwide text-[17px] font-bold text-navy-950">{q.stem}</p>
              <ul className="mt-2 grid gap-1 text-[15px]">
                {q.choices.map((c, i) => <li key={i} className={i === q.answer ? 'font-bold text-good' : ''}>{LETTERS[i]}. {c}{i === q.answer ? ' (marked correct)' : ''}</li>)}
              </ul>
              <p className="mt-2 text-[14px] text-ink-2">{q.explanation}</p>
              {q.reasons.length > 0 && <p className="mt-2 text-[14px] font-semibold text-bad">Reports: {q.reasons.join('; ')}</p>}
              <div className="mt-4 flex gap-3">
                <button className={btn.quiet} onClick={async () => { await api.admin.setQuestionStatus(q.id, 'active'); await changed(); }}>Restore</button>
                <button className="text-[14px] font-bold text-bad" onClick={async () => { await api.admin.setQuestionStatus(q.id, 'deleted'); await changed(); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
