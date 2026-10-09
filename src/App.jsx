import { useCallback, useEffect, useState } from 'react';
import { listVideos, listWidgets, getSettings, getToken, setToken, apiBase } from './api.js';
import Home from './Home.jsx';
import Videos from './Videos.jsx';
import Products from './Products.jsx';
import WidgetsPage from './WidgetsPage.jsx';
import Customizations from './Customizations.jsx';
import Analytics from './Analytics.jsx';
import Integrations from './Integrations.jsx';
import Logo from './Logo.jsx';
import Loader from './Loader.jsx';

const NAV = [
  { id: 'home', label: 'Home' }, { id: 'videos', label: 'Videos', badge: true }, { id: 'products', label: 'Products' },
  { group: 'Video widgets' },
  { id: 'w:product', label: 'Product Pages' }, { id: 'w:home', label: 'Homepage' }, { id: 'w:collection', label: 'Collection Pages' }, { id: 'w:pages', label: 'Pages' },
  { group: 'Analytics' }, { id: 'analytics', label: 'Overview' },
  { group: 'Settings' }, { id: 'custom', label: 'Customizations' }, { id: 'integrations', label: 'Integrations' },
];

export default function App() {
  const [route, setRoute] = useState('home');
  const [authed, setAuthed] = useState(!!getToken());
  const [videos, setVideos] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const fail = useCallback((e) => { if (e.message === 'unauthorized') setAuthed(false); else setError(e.message); }, []);
  const loadVideos = useCallback(() => listVideos().then(setVideos).catch(fail), [fail]);
  const loadWidgets = useCallback(() => listWidgets().then(setWidgets).catch(fail), [fail]);
  const loadSettings = useCallback(() => getSettings().then(setSettings).catch(fail), [fail]);
  useEffect(() => {
    if (!authed) return;
    const t0 = Date.now();
    Promise.allSettled([loadVideos(), loadWidgets(), loadSettings()]).then(() => setTimeout(() => setReady(true), Math.max(0, 700 - (Date.now() - t0))));
  }, [authed, loadVideos, loadWidgets, loadSettings]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  if (!ready) return <Loader />;
  const ctx = { videos, widgets, settings, loadVideos, loadWidgets, loadSettings, setError, go: setRoute };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo /></div>
        {NAV.map((n, i) => n.group
          ? <div className="grp" key={i}>{n.group}</div>
          : <button key={n.id} className={'nav' + (n.id === route ? ' on' : '')} onClick={() => setRoute(n.id)}>{n.label}{n.badge && <span className="badge">{videos.length}</span>}</button>)}
        <div className="grow" />
        <button className="nav" onClick={() => { setToken(''); setAuthed(false); }}>Sign out</button>
      </aside>
      <main className={'main' + (route === 'custom' ? ' full' : '')}>
        {error && <div className="err" onClick={() => setError('')}>{error} (click to dismiss)</div>}
        {!apiBase && <div className="err">VITE_API_URL is not set, so the admin cannot reach the API.</div>}
        {route === 'home' && <Home {...ctx} />}
        {route === 'videos' && <Videos {...ctx} />}
        {route === 'products' && <Products {...ctx} />}
        {route.startsWith('w:') && <WidgetsPage key={route} page={route.slice(2)} {...ctx} />}
        {route === 'analytics' && <Analytics {...ctx} />}
        {route === 'custom' && settings && <Customizations {...ctx} />}
        {route === 'integrations' && <Integrations {...ctx} />}
      </main>
    </div>
  );
}

function Login({ onDone }) {
  const [t, setT] = useState('');
  return (
    <div className="overlay" style={{ background: '#fafafa' }}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); setToken(t.trim()); onDone(); }}>
        <Logo size={36} />
        <label className="lab">Admin token<input type="password" autoFocus value={t} onChange={(e) => setT(e.target.value)} /></label>
        <button className="btn">Sign in</button>
      </form>
    </div>
  );
}
