import { useEffect, useRef, useState } from 'react';
import { listChecks, getCheck, runCheck, getCheckPages, saveCheckPages } from './api.js';
import { Empty, Table } from './ui.jsx';

const skipped = (c) => c.status === 'warn' && c.summary && c.summary.skipped;
const nameOf = (c) => (skipped(c) ? 'Skipped, the store was busy' : LABEL[c.status] || c.status);
const LABEL = { ok: 'All good', warn: 'Needs a look', fail: 'Problems found', running: 'Checking now...' };
const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? (s % 60) + ' s' : ''}` : `${s} s`);
const Tick = ({ ok, na }) => (na ? <span className="muted">-</span> : ok ? <span className="chk-ok">✓</span> : <span className="chk-bad">✗</span>);

function Details({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { getCheck(id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="red small">{err}</p>;
  if (!d) return <p className="muted small">Loading...</p>;
  const rows = (Array.isArray(d.details) ? d.details : []).filter((r) => r && typeof r === 'object');
  const bad = rows.filter((r) => r.problems && r.problems.length);
  return (
    <div className="chkdet">
      {bad.length > 0 && (
        <div className="chkbad"><b>What needs attention</b>
          {bad.map((r, i) => <p key={i}><span className="pill draft">{deviceName(r.device)}</span> <a href={pageUrl(r)} target="_blank" rel="noreferrer">{pageName(r)}</a> <code>{r.widget}</code>: {r.problems.join('; ')}</p>)}
        </div>
      )}
      {d.summary && d.summary.notes && d.summary.notes.length > 0 && <div className="chknote">{d.summary.notes.map((n, i) => <p key={i} className="muted small">{n}</p>)}</div>}
      <Table>
        <thead><tr><th>Page</th><th>Device</th><th>Widget</th><th>Shown</th><th>Plays</th><th>Size and shape</th><th>Notes</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className={r.problems && r.problems.length ? 'chkrow bad' : 'chkrow'}>
            <td><a href={pageUrl(r)} target="_blank" rel="noreferrer">{pageName(r)}</a></td>
            <td>{deviceName(r.device)}</td>
            <td><code>{r.widget}</code> <span className="muted small">{r.type}</span></td>
            <td><Tick ok={r.drawn} /></td>
            <td><Tick ok={r.playing} na={r.playing === null || r.playing === undefined} /></td>
            <td>{r.shapeOk === null || r.shapeOk === undefined ? <span className="muted">-</span> : <><Tick ok={r.shapeOk} /> <span className="muted small">{r.actual}{r.expected ? ` (expected ${r.expected})` : ''}</span></>}</td>
            <td className="muted small">{(r.problems || []).concat(r.warnings || []).join('; ') || ''}</td>
          </tr>))}
        </tbody>
      </Table>
    </div>
  );
}

const pageUrl = (r) => (/^https?:/.test(r.url) ? r.url : 'https://tucokids.com' + (r.path || ''));
const pageName = (r) => (r.path === '/' || !r.path ? 'Home page' : r.path);
const deviceName = (d) => (d === 'server' ? 'automatic' : d);

export default function Checks() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pagesInfo, setPagesInfo] = useState(null);
  const [pagesText, setPagesText] = useState('');
  const [pagesMsg, setPagesMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = () => listChecks().then((d) => { if (!alive.current) return d; setData(d); if (d.checks && d.checks[0]) setOpen(d.checks[0].id); return d; }).catch((e) => { setErr(e.message); return null; });
  // The check runs on Cloudflare, so this page only has to watch it: any phone or laptop can start it, and reopening the page picks it up again.
  const follow = async () => {
    for (let i = 0; i < 100 && alive.current; i++) {
      const d = await load();
      if (!d || !d.checks || !d.checks[0] || d.checks[0].status !== 'running') return;
      await new Promise((r) => setTimeout(r, 2500));
    }
  };
  useEffect(() => { follow(); getCheckPages().then((p) => { setPagesInfo(p); setPagesText(p.pages.join('\n')); }).catch(() => {}); }, []);
  const runNow = async () => { setBusy(true); setErr(''); try { await runCheck(); await follow(); } catch (e) { setErr(e.message); } setBusy(false); };
  const savePages = async (reset) => {
    setPagesMsg('Saving...');
    try { const r = await saveCheckPages(reset ? '' : pagesText); setPagesInfo(r); setPagesText(r.pages.join('\n')); setPagesMsg(reset ? 'Back to the standard list.' : `Saved. ${r.pages.length} page${r.pages.length === 1 ? '' : 's'} will be checked.`); }
    catch (e) { setPagesMsg(e.message); }
  };
  const last = data && data.checks && data.checks[0];
  return (
    <>
      <div className="bar"><div><h1>Site checks</h1><p className="sub">Loopy checks your live website by itself three times a day (12 am, 4 am and 6 am India time), even when no one is online. It opens the important pages and checks that each one still has its banner, that the banner is switched on, and that every video and picture file it needs exists. Nothing is changed on your site.</p></div><button className="btn" onClick={runNow} disabled={busy || (last && last.status === 'running')}>{busy || (last && last.status === 'running') ? 'Checking…' : 'Check now'}</button></div>
      {err && <p className="red">{err}</p>}
      {!data && !err && <p className="muted">Loading...</p>}
      {data && data.setup && <Empty>The check results are not set up yet. They appear here after the first scheduled check has run.</Empty>}
      {data && !data.setup && !data.checks.length && <Empty>No checks have run yet. The first one appears here as soon as it finishes.</Empty>}
      {last && last.status === 'running' && (
        <div className="chkhero running" role="status"><b><span className="chkspin" aria-hidden="true" /> Checking {last.pages} page{last.pages === 1 ? '' : 's'} now...</b><span>This takes about half a minute. You can leave this page open, or come back later: the check keeps going on its own.</span></div>
      )}
      {last && last.status !== 'running' && (
        <div className={'chkhero ' + (skipped(last) ? 'skipped' : last.status)}>
          <b>{nameOf(last)}</b>
          <span>Last check {when(last.at)}. {last.pages} page{last.pages === 1 ? '' : 's'} checked, {last.failures} problem{last.failures === 1 ? '' : 's'}.</span>
        </div>
      )}
      {pagesInfo && (
        <details className="chkpages">
          <summary>Pages checked ({pagesInfo.pages.length}){pagesInfo.isDefault ? '' : ' - your own list'}</summary>
          <p className="muted small">One page per line. You can paste full links from tucokids.com or just the part after it, such as /collections/new-arrivals. Every check, on any device, opens exactly these pages.</p>
          <textarea value={pagesText} onChange={(e) => setPagesText(e.target.value)} rows={Math.min(14, Math.max(5, pagesText.split('\n').length + 1))} spellCheck={false} aria-label="Pages to check" />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><button className="btn" onClick={() => savePages(false)}>Save list</button><button className="btn ghost" onClick={() => savePages(true)}>Back to the standard list</button></div>
          {pagesMsg && <p className="muted small">{pagesMsg}</p>}
        </details>
      )}
      {data && data.checks.length > 0 && (
        <Table className="chktable">
          <thead><tr><th>When</th><th>Result</th><th>Pages</th><th>Problems</th><th>Took</th><th /></tr></thead>
          <tbody>{data.checks.map((c) => (
            <>
              <tr key={c.id} className={'chkrun' + (open === c.id ? ' on' : '')} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <td>{when(c.at)}</td>
                <td><span className={'pill ' + (c.status === 'ok' ? 'live' : 'draft')}>{nameOf(c)}</span></td>
                <td>{c.pages}</td><td>{c.status === 'running' ? '-' : c.failures}</td><td>{c.status === 'running' ? '...' : dur(c.durationS)}</td>
                <td><button className="link" type="button">{open === c.id ? 'Hide' : 'Details'}</button></td>
              </tr>
              {open === c.id && <tr key={c.id + 'd'}><td colSpan={6}><Details id={c.id} /></td></tr>}
            </>))}
          </tbody>
        </Table>
      )}
    </>
  );
}
