import { useEffect, useState } from 'react';
import { syncInstagram, apiBase, getHealth, downloadBackup, getInstagram, setInstagramAuto, getInstagramReview, approveInstagram } from './api.js';
import { Thumb } from './media.jsx';

export default function Integrations({ loadVideos }) {
  const [msg, setMsg] = useState('');
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [ig, setIg] = useState(null);
  const [review, setReview] = useState(null);
  const [picked, setPicked] = useState({});
  const loadIg = () => Promise.all([getInstagram(), getInstagramReview()]).then(([st, rv]) => {
    setIg(st); setReview(rv);
    const pre = {}; rv.items.forEach((i) => { const s = i.suggestions.filter((x) => x.score >= 67).map((x) => x.handle); if (s.length) pre[i.id] = s; }); setPicked(pre);
  }).catch(() => {});
  useEffect(() => { loadIg(); }, []);
  const toggleAuto = async () => { const next = !(ig && ig.auto); setIg({ ...ig, auto: next }); try { await setInstagramAuto(next); } catch { setIg(ig); } };
  const toggleTag = (id, h) => setPicked((p) => { const cur = p[id] || []; return { ...p, [id]: cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h] }; });
  const approveNow = async (ids) => {
    const approvals = ids.map((id) => ({ id, handles: picked[id] || [] })).filter((a) => a.handles.length);
    if (!approvals.length) { setMsg('Pick at least one product first.'); return; }
    try { const r = await approveInstagram(approvals); setMsg(`Tagged products on ${r.approved} video${r.approved === 1 ? '' : 's'}. They are still drafts: set them live when you are ready.`); await loadIg(); loadVideos(); } catch (e) { setMsg(e.message); }
  };
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
  const check = () => { setHealth(null); setHealthErr(''); getHealth().then(setHealth).catch((e) => setHealthErr(e.message)); };
  useEffect(check, []);
  const LABELS = { database: 'Database', tables: 'Database is up to date', storage: 'Video storage (R2)', store: 'Store products', orders: 'Sales tracking (optional)', instagram: 'Instagram copying (optional)', origins: 'Allowed store addresses' };
  const sync = async () => { setMsg('Syncing...'); try { const r = await syncInstagram(); setMsg(r.skipped || r.error || `Copied ${r.added} new reel(s) as drafts`); loadVideos(); loadIg(); } catch (e) { setMsg(e.message); } };
  return (
    <>
      <div className="bar"><div><h1>Integrations</h1><p className="sub">Where videos come from and how the store connects.</p></div></div>
      <div className="icard wide">
        <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}><b>System check</b><button className="link" onClick={check}>Check again</button></div>
        {healthErr && <p className="red small">{healthErr}</p>}
        {!health && !healthErr && <p className="muted">Checking...</p>}
        {health && <ul className="syschk">{Object.entries(health.checks).map(([k, c]) => <li key={k} className={c.ok ? 'ok' : /optional/i.test(c.note) ? 'opt' : 'bad'}><span className="dot">{c.ok ? '✓' : /optional/i.test(c.note) ? '–' : '✗'}</span><div><b>{LABELS[k] || k}</b><small>{c.note}</small></div></li>)}</ul>}
        {health && <p className="muted small">{health.totals.videos} videos ({health.totals.live} live), {health.totals.widgets} widgets, {health.totals.events30d} events in the last 30 days.</p>}
      </div>
      <div className="icard wide"><b>Back up your data</b><p>Downloads one file with all your videos, widgets and settings. Cloudflare also keeps 30 days of database history.</p><button className="btn" onClick={async () => { setBackupMsg('Preparing...'); try { await downloadBackup(); setBackupMsg('Backup downloaded.'); } catch (e) { setBackupMsg(e.message); } }}>Download backup</button>{backupMsg && <p className="muted small">{backupMsg}</p>}</div>
      <div className="icards">
        <div className="icard wide igcard">
          <div className="row" style={{ justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}><b>Instagram</b>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}><span className="muted small">Copy new reels every day</span><button type="button" role="switch" aria-checked={!!(ig && ig.auto)} aria-label="Copy new reels every day" className={'tgl' + (ig && ig.auto ? ' on' : '')} onClick={toggleAuto} disabled={!ig}><i /></button></label></div>
          <p>Copies new reels from your Instagram account into your own storage as drafts, once a day (about 3:30 am India time). The copies are yours, so they keep working even when Instagram's own links expire.</p>
          <p className="muted small">{!ig ? 'Checking...' : !ig.configured ? 'Not connected yet. Follow the connection steps below.' : ig.last ? (ig.last.error ? `Last sync ${ago(ig.last.at)} failed: ${ig.last.error}` : ig.last.skipped ? `Last sync ${ago(ig.last.at)}: ${ig.last.skipped}` : `Last sync ${ago(ig.last.at)} (${ig.last.by === 'manual' ? 'by you' : 'automatic'}): copied ${ig.last.added} new reel${ig.last.added === 1 ? '' : 's'}${ig.last.waiting ? `, ${ig.last.waiting} more waiting for the next run` : ''}.`) : 'Connected. No sync has run yet.'}</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><button className="btn" onClick={sync}>Sync now</button></div>
          {msg && <p className="muted">{msg}</p>}
          {review && review.items.length > 0 && (
            <div className="igready">
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><b>{ig && ig.ready ? `${ig.ready} video${ig.ready === 1 ? ' is' : 's are'} ready to approve` : 'New reels with no products yet'}</b>
                <button className="btn" onClick={() => approveNow(review.items.map((i) => i.id))}>Approve all picked</button></div>
              <p className="muted small">Loopy matched each reel's caption to your products. Tick the right ones and approve. Approving only tags the products; the video stays a draft until you set it live.{!review.catalogOk && ' (The store product list could not be read just now, so no matches are shown. Try again in a minute.)'}</p>
              {review.items.map((i) => (
                <div className="igrow" key={i.id}>
                  <Thumb url={i.url} poster={i.poster} className="igth" />
                  <div className="igbody"><span className="igtitle">{i.title}</span>
                    {i.suggestions.length ? <div className="igsug">{i.suggestions.map((s) => <label key={s.handle} className={'igchip' + ((picked[i.id] || []).includes(s.handle) ? ' on' : '')}><input type="checkbox" checked={(picked[i.id] || []).includes(s.handle)} onChange={() => toggleTag(i.id, s.handle)} />{s.title} <em>{s.score >= 67 ? 'strong match' : 'possible'}</em></label>)}</div>
                      : <span className="muted small">No match found. Tag it by hand on the Videos page.</span>}
                  </div>
                  {i.suggestions.length > 0 && <button className="btn ghost" onClick={() => approveNow([i.id])}>Approve</button>}
                </div>
              ))}
            </div>
          )}
          <details className="igsteps"><summary>How to connect Instagram (one time)</summary>
            <ol>
              <li>Your Instagram account must be a <b>Business or Creator</b> account (Instagram app: Settings, Account type).</li>
              <li>Go to <b>developers.facebook.com</b>, open <b>My Apps</b>, create an app (type <b>Business</b>) and add the product <b>Instagram</b> (the "API setup with Instagram login" option).</li>
              <li>Add your Instagram account as a tester or role on the app, and accept the invite in the Instagram app (Settings, Website permissions, Apps and websites).</li>
              <li>In the app's Instagram setup, choose <b>Generate access token</b> for your account with the permission <b>instagram_business_basic</b>, and copy the long token.</li>
              <li>On your computer, in the Loopy project folder, run <code>cd worker</code> then <code>npx wrangler secret put IG_TOKEN</code> and paste the token when asked. Never paste it in a chat or a file.</li>
              <li>Come back here, press <b>Sync now</b>. New reels appear as drafts. The token renews itself on every daily run.</li>
            </ol>
            <p className="muted small">Meta renames some screens from time to time; the names above may differ slightly.</p>
          </details>
        </div>
        <div className="icard wide"><b>Sales from videos (Shopify order webhook)</b><p>Credits orders and sales to the video that led to the add to cart. In Shopify admin go to <b>Settings → Notifications → Webhooks → Create webhook</b>, choose the event <b>Order creation</b>, format <b>JSON</b>, and paste this URL. Then copy the signing secret shown on that page and give it to the API as <code>SHOPIFY_WEBHOOK_SECRET</code> (<code>npx wrangler secret put SHOPIFY_WEBHOOK_SECRET</code>).</p><code>{(apiBase || '') + '/api/webhooks/shopify/orders'}</code></div>
        <div className="icard"><b>Shopify store</b><p>Products are read from your public store catalogue, so there is nothing to connect.</p><code>STORE_URL in worker/wrangler.toml</code></div>
        <div className="icard"><b>API</b><p>The store widget script talks to this API.</p><code>{apiBase || 'not set'}</code></div>
      </div>
    </>
  );
}
