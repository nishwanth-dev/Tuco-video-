import { useEffect, useState } from 'react';
import { syncInstagram, apiBase, getHealth, downloadBackup } from './api.js';

export default function Integrations({ loadVideos }) {
  const [msg, setMsg] = useState('');
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const check = () => { setHealth(null); setHealthErr(''); getHealth().then(setHealth).catch((e) => setHealthErr(e.message)); };
  useEffect(check, []);
  const LABELS = { database: 'Database', tables: 'Database is up to date', storage: 'Video storage (R2)', store: 'Store products', orders: 'Sales tracking (optional)', instagram: 'Instagram copying (optional)', origins: 'Allowed store addresses' };
  const sync = async () => { setMsg('Syncing...'); try { const r = await syncInstagram(); setMsg(r.skipped || r.error || `Copied ${r.added} new reel(s) as drafts`); loadVideos(); } catch (e) { setMsg(e.message); } };
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
        <div className="icard"><b>Instagram</b><p>Copies new reels from your Instagram account into your own storage as drafts, every Monday. Needs IG_TOKEN set on the API.</p><button className="btn" onClick={sync}>Sync now</button>{msg && <p className="muted">{msg}</p>}</div>
        <div className="icard wide"><b>Sales from videos (Shopify order webhook)</b><p>Credits orders and sales to the video that led to the add to cart. In Shopify admin go to <b>Settings → Notifications → Webhooks → Create webhook</b>, choose the event <b>Order creation</b>, format <b>JSON</b>, and paste this URL. Then copy the signing secret shown on that page and give it to the API as <code>SHOPIFY_WEBHOOK_SECRET</code> (<code>npx wrangler secret put SHOPIFY_WEBHOOK_SECRET</code>).</p><code>{(apiBase || '') + '/api/webhooks/shopify/orders'}</code></div>
        <div className="icard"><b>Shopify store</b><p>Products are read from your public store catalogue, so there is nothing to connect.</p><code>STORE_URL in worker/wrangler.toml</code></div>
        <div className="icard"><b>API</b><p>The store widget script talks to this API.</p><code>{apiBase || 'not set'}</code></div>
      </div>
    </>
  );
}
