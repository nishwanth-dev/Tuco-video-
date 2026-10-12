import { useEffect, useMemo, useRef, useState } from 'react';
import { TOPICS, SUGGESTIONS, CATEGORIES, PAGE_TIPS } from './kb.js';
import { answer, intent, diagnose } from './engine.js';
import { getHealth } from '../api.js';
import Mascot from './Mascot.jsx';

const KEY = 'loopy_bot_chat_v1';
const byId = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
const Avatar = () => <span className="bav"><Mascot variant="head" size={26} bob={false} /></span>;
const ROUTE_NAMES = { home: 'Home', videos: 'Videos', products: 'Products', 'w:product': 'Product Pages', 'w:home': 'Homepage', 'w:collection': 'Collection Pages', 'w:pages': 'Pages', analytics: 'Overview', custom: 'Customizations', integrations: 'Integrations' };

function load() { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; } }

export default function Bot({ route, ctx }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  const input = useRef();

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* storage unavailable */ } }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open, busy]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  const tips = useMemo(() => PAGE_TIPS[route] || SUGGESTIONS.slice(0, 3), [route]);
  const push = (m) => setMsgs((o) => [...o, { id: Date.now() + Math.random(), ...m }]);

  const showTopic = (t, extra = {}) => push({ from: 'bot', type: 'topic', topicId: t.id, ...extra });

  async function reply(q) {
    const it = intent(q);
    if (it.type === 'empty') return;
    if (it.type === 'clear') { setMsgs([]); return; }
    push({ from: 'user', text: q });
    if (it.type === 'browse') { push({ from: 'bot', type: 'browse' }); return; }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 220));
    try {
      if (it.type === 'greet') push({ from: 'bot', type: 'text', text: 'Hi! I can walk you through anything in Loopy. Ask me a question, or pick one below.', chips: SUGGESTIONS });
      else if (it.type === 'thanks') push({ from: 'bot', type: 'text', text: 'Happy to help! Ask me anything else about Loopy whenever you like.' });
      else if (it.type === 'about') push({ from: 'bot', type: 'text', text: 'I am the Loopy helper. I know how every part of Loopy works, and I can check your setup for problems. Try "check my setup".', chips: ['Check my setup', ...SUGGESTIONS.slice(0, 2)] });
      else if (it.type === 'diagnose') {
        let health = null;
        try { health = await getHealth(); } catch { /* the check still runs on what is already loaded */ }
        push({ from: 'bot', type: 'diagnose', result: diagnose({ videos: ctx.videos, widgets: ctx.widgets, settings: ctx.settings, health }) });
      } else {
        const a = answer(q);
        if (a.kind === 'topic') showTopic(a.topic, { related: (a.related || []).map((t) => t.id), unsure: !a.confident });
        else push({ from: 'bot', type: 'unknown', options: a.options.map((t) => t.id) });
      }
    } catch (e) {
      push({ from: 'bot', type: 'text', text: 'Sorry, something went wrong on my side. Please try asking again.' });
    }
    setBusy(false);
  }

  const send = (q) => { const v = (q ?? text).trim(); if (!v) return; setText(''); reply(v); };
  const goTo = (r) => { if (r) { ctx.go(r); if (window.matchMedia('(max-width: 700px)').matches) setOpen(false); } };
  const vote = (id, v) => setMsgs((o) => o.map((m) => (m.id === id ? { ...m, vote: v } : m)));

  const Chips = ({ items, onPick }) => <div className="bchips">{items.map((c) => <button key={c} className="bchip" onClick={() => onPick(c)}>{c}</button>)}</div>;

  const Row = ({ k, children }) => <div className="bmsg" key={k}><div className="brow2"><Avatar /><div className="bcol">{children}</div></div></div>;

  function render(m) {
    if (m.from === 'user') return <div className="bmsg user" key={m.id}><div className="bbub">{m.text}</div></div>;
    if (m.type === 'text') return <Row k={m.id}><div className="bbub">{m.text}</div>{m.chips && <Chips items={m.chips} onPick={send} />}</Row>;
    if (m.type === 'topic') {
      const t = byId[m.topicId];
      if (!t) return null;
      const related = (m.related || []).map((id) => byId[id]).filter(Boolean);
      return (
        <Row k={m.id}>
          <div className="bbub">
            <strong>{t.title}</strong>
            <p>{t.answer}</p>
            {t.steps?.length > 0 && <ol>{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
            {t.note && <p className="bnote">{t.note}</p>}
            <div className="brow">
              {t.go && <button className="bgo" onClick={() => goTo(t.go)}>Take me to {ROUTE_NAMES[t.go]} →</button>}
              {t.diagnose && <button className="bgo ghost" onClick={() => send('Check my setup')}>Check my setup</button>}
            </div>
            <div className="bvote">{m.vote ? <span>{m.vote === 'up' ? 'Thanks for the feedback!' : 'Sorry about that. Try rephrasing or pick a topic below.'}</span> : <><span>Was this helpful?</span><button onClick={() => vote(m.id, 'up')} aria-label="Helpful">👍</button><button onClick={() => vote(m.id, 'down')} aria-label="Not helpful">👎</button></>}</div>
          </div>
          {(related.length > 0 && (m.unsure || m.vote === 'down')) || m.vote === 'down'
            ? <><div className="bhint">Not what you meant?</div><Chips items={related.map((r) => r.title)} onPick={(title) => { const r = TOPICS.find((x) => x.title === title); if (r) { push({ from: 'user', text: title }); showTopic(r); } }} /></>
            : related.length > 0 && <><div className="bhint">Related</div><Chips items={related.map((r) => r.title)} onPick={(title) => { const r = TOPICS.find((x) => x.title === title); if (r) { push({ from: 'user', text: title }); showTopic(r); } }} /></>}
        </Row>
      );
    }
    if (m.type === 'unknown') {
      const opts = (m.options || []).map((id) => byId[id]).filter(Boolean);
      return (
        <Row k={m.id}>
          <div className="bbub">I am not sure I understood that. I can help with Loopy: videos, widgets, your theme, sizes and looks, analytics, moving from Whatmore and fixing problems.{opts.length > 0 && ' Did you mean one of these?'}</div>
          {opts.length > 0 && <Chips items={opts.map((o) => o.title)} onPick={(title) => { const r = TOPICS.find((x) => x.title === title); push({ from: 'user', text: title }); showTopic(r); }} />}
          <div className="bhint">Or try asking like this</div>
          <Chips items={SUGGESTIONS.slice(0, 4)} onPick={send} />
          <button className="bgo ghost" onClick={() => push({ from: 'bot', type: 'browse' })}>Browse all topics</button>
        </Row>
      );
    }
    if (m.type === 'browse') {
      return (
        <Row k={m.id}>
          <div className="bbub"><strong>Topics</strong>
            {CATEGORIES.map(([cat, ids]) => <div key={cat} className="bcat"><span>{cat}</span><div className="bchips">{ids.map((id) => byId[id]).filter(Boolean).map((t) => <button key={t.id} className="bchip" onClick={() => { push({ from: 'user', text: t.title }); showTopic(t); }}>{t.title}</button>)}</div></div>)}
          </div>
        </Row>
      );
    }
    if (m.type === 'diagnose') {
      const { issues, ok } = m.result;
      const bad = issues.filter((i) => i.level === 'bad' || i.level === 'warn');
      return (
        <Row k={m.id}>
          <div className="bbub">
            <strong>{bad.length ? `I found ${bad.length} thing${bad.length === 1 ? '' : 's'} to fix` : 'Your setup looks good'}</strong>
            <ul className="bdiag">
              {[...issues, ...ok].map((i, k) => (
                <li key={k} className={i.level}><span className="dot">{i.level === 'ok' ? '✓' : i.level === 'bad' ? '✗' : i.level === 'warn' ? '!' : 'i'}</span><span>{i.text}{i.go && i.level !== 'ok' && <> <button className="blink" onClick={() => goTo(i.go)}>Fix it →</button></>}</span></li>
              ))}
            </ul>
          </div>
        </Row>
      );
    }
    return null;
  }

  const starters = [...new Set([...tips, ...SUGGESTIONS])].filter((c) => c !== 'Check my setup').slice(0, 4);
  return (
    <>
      {!open && (
        <button className="bfab" onClick={() => setOpen(true)} aria-label="Open the Loopy helper">
          <Mascot variant="head" size={46} />
          <span className="bfab-label">Ask Loopy</span>
        </button>
      )}
      {open && (
        <div className="bpanel" role="dialog" aria-label="Loopy helper">
          <div className="bhead">
            <div className="bhl"><Mascot variant="head" size={34} bob={false} /><div><b>Loopy</b><small><i className="live" /> Here to help</small></div></div>
            <div className="bhr">
              {msgs.length > 0 && <button className="bicon" onClick={() => setMsgs([])} aria-label="New chat" title="New chat">✎</button>}
              <button className="bicon" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="bbody" aria-live="polite">
            {msgs.length === 0 && (
              <div className="bwelcome">
                <Mascot size={104} wave />
                <h3>Hi, I am Loopy!</h3>
                <p>Ask me how to do anything in Loopy, and I will walk you through it step by step.</p>
                <div className="bcards">{starters.map((c) => <button key={c} className="bcard" onClick={() => send(c)}>{c}</button>)}</div>
                <div className="bwrow"><button className="bgo ghost" onClick={() => send('Check my setup')}>Check my setup</button><button className="bgo ghost" onClick={() => push({ from: 'bot', type: 'browse' })}>Browse topics</button></div>
              </div>
            )}
            {msgs.map(render)}
            {busy && <Row k="typing"><div className="bbub typing"><i /><i /><i /></div></Row>}
            <div ref={end} />
          </div>
          <div className="bfoot">
            <form className="bform" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask me anything about Loopy" maxLength={300} aria-label="Your question" />
              <button className="bsend" disabled={!text.trim() || busy} aria-label="Send"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            </form>
            <small>I answer from Loopy's guide, so double-check anything important.</small>
          </div>
        </div>
      )}
    </>
  );
}
