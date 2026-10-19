import { useCallback, useEffect, useState } from 'react';
import { listVideos, listWidgets, getSettings, getToken, setToken, apiBase, checkToken } from './api.js';
import Home from './Home.jsx';
import Videos from './Videos.jsx';
import Products from './Products.jsx';
import WidgetsPage from './WidgetsPage.jsx';
import Customizations from './Customizations.jsx';
import Analytics from './Analytics.jsx';
import Checks from './Checks.jsx';
import Integrations from './Integrations.jsx';
import Logo from './Logo.jsx';
import Loader from './Loader.jsx';
import Bot from './bot/Bot.jsx';

const NAV = [
  { id: 'home', label: 'Home' }, { id: 'videos', label: 'Videos', badge: true }, { id: 'products', label: 'Products' },
  { group: 'Video widgets' },
  { id: 'w:product', label: 'Product Pages' }, { id: 'w:home', label: 'Homepage' }, { id: 'w:collection', label: 'Collection Pages' }, { id: 'w:pages', label: 'Pages' },
  { group: 'Analytics' }, { id: 'analytics', label: 'Overview' }, { id: 'checks', label: 'Site checks' },
  { group: 'Settings' }, { id: 'custom', label: 'Customizations' }, { id: 'integrations', label: 'Integrations' },
];

const ROUTES = ['home', 'videos', 'products', 'w:product', 'w:home', 'w:collection', 'w:pages', 'analytics', 'checks', 'custom', 'integrations'];
// Each page has its own address (#/videos), so the browser and phone back button move between pages.
const fromHash = () => { const r = decodeURIComponent(location.hash.replace(/^#\/?/, '')); return ROUTES.includes(r) ? r : 'home'; };

export default function App() {
  const [route, setRoute] = useState(fromHash);
  const [authed, setAuthed] = useState(!!getToken());
  const [videos, setVideos] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const go = useCallback((r) => {
    if (r === fromHash()) { setRoute(r); return; }
    history.pushState({ loopyRoute: r }, '', '#/' + r);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    // Make the very first page a real history entry too, then follow the back and forward buttons.
    if (!location.hash) history.replaceState({ loopyRoute: 'home' }, '', '#/home');
    const onPop = () => setRoute(fromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const fail = useCallback((e) => { if (e.message === 'unauthorized') setAuthed(false); else setError(e.message); }, []);
  const loadVideos = useCallback(() => listVideos().then(setVideos).catch(fail), [fail]);
  const loadWidgets = useCallback(() => listWidgets().then(setWidgets).catch(fail), [fail]);
  const loadSettings = useCallback(() => getSettings().then(setSettings).catch(fail), [fail]);
  useEffect(() => {
    if (!authed) return;
    const t0 = Date.now();
    Promise.allSettled([loadVideos(), loadWidgets(), loadSettings()]).then(() => setTimeout(() => setReady(true), Math.max(0, 700 - (Date.now() - t0))));
  }, [authed, loadVideos, loadWidgets, loadSettings]);

  // phones: the menu is a side drawer opened from the button in the top bar
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!menuOpen) return undefined; const k = (e) => { if (e.key === 'Escape') setMenuOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [menuOpen]);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  if (!ready) return <Loader />;
  const ctx = { videos, widgets, settings, loadVideos, loadWidgets, loadSettings, setError, go };

  return (
    <div className="shell">
      <header className="mbar">
        <button className="menubtn" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="sidemenu" onClick={() => setMenuOpen(true)}><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
        <div className="mlogo"><Logo /></div>
        <span className="mtitle">{(NAV.find((n) => n.id === route) || {}).label}</span>
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside id="sidemenu" className={'side' + (menuOpen ? ' open' : '')}>
        <div className="brand"><Logo /></div>
        {NAV.map((n, i) => n.group
          ? <div className="grp" key={i}>{n.group}</div>
          : <button key={n.id} className={'nav' + (n.id === route ? ' on' : '')} onClick={() => { go(n.id); setMenuOpen(false); }}>{n.label}{n.badge && <span className="badge">{videos.length}</span>}</button>)}
        <div className="grow" />
        <button className="nav" onClick={() => { setMenuOpen(false); setToken(''); setAuthed(false); }}>Sign out</button>
      </aside>
      <main className={'main' + (route === 'custom' ? ' full' : '')}>
        {error && <div className="err" onClick={() => setError('')}>{error} (click to dismiss)</div>}
        {!apiBase && <div className="err">VITE_API_URL is not set, so the admin cannot reach the API.</div>}
        {route === 'home' && <Home {...ctx} />}
        {route === 'videos' && <Videos {...ctx} />}
        {route === 'products' && <Products {...ctx} />}
        {route.startsWith('w:') && <WidgetsPage key={route} page={route.slice(2)} {...ctx} />}
        {route === 'analytics' && <Analytics {...ctx} />}
        {route === 'checks' && <Checks />}
        {route === 'custom' && settings && <Customizations {...ctx} />}
        {route === 'integrations' && <Integrations {...ctx} />}
      </main>
      <Bot route={route} ctx={ctx} />
    </div>
  );
}

function Login({ onDone }) {
  const [t, setT] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const tok = t.trim();
    if (!tok) { setErr('Enter your admin token.'); return; }
    setBusy(true); setErr('');
    const problem = await checkToken(tok);
    setBusy(false);
    if (problem) { setErr(problem); return; }
    setToken(tok); onDone();
  };
  return (
    <div className="overlay" style={{ background: '#fafafa' }}>
      <form className="modal" onSubmit={submit}>
        <Logo size={36} />
        <label className="lab">Admin token<input type="password" autoFocus value={t} onChange={(e) => { setT(e.target.value); setErr(''); }} /></label>
        {err && <p className="red small" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Checking...' : 'Sign in'}</button>
      </form>
    </div>
  );
}
