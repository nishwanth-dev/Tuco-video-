import { useCallback, useEffect, useState } from 'react';
import { listVideos, saveVideo, deleteVideo, isLive, getToken, setToken } from './api.js';
import Library from './Library.jsx';
import Widgets from './Widgets.jsx';
import Analytics from './Analytics.jsx';

const TABS = ['Videos', 'Widgets', 'Analytics'];

export default function App() {
  const [tab, setTab] = useState('Videos');
  const [videos, setVideos] = useState([]);
  const [authed, setAuthed] = useState(!isLive || !!getToken());
  const [error, setError] = useState('');

  const load = useCallback(() => listVideos().then(setVideos).catch((e) => {
    if (e.message === 'unauthorized') setAuthed(false); else setError(e.message);
  }), []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const act = (fn) => async (...a) => { try { await fn(...a); await load(); } catch (e) { setError(e.message); } };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Tuco Videos</div>
        {TABS.map((t) => <button key={t} className={'nav' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>)}
        {isLive && <button className="nav" onClick={() => { setToken(''); setAuthed(false); }}>Sign out</button>}
      </aside>
      <main className="main">
        {error && <div className="err" onClick={() => setError('')}>{error} (click to dismiss)</div>}
        {tab === 'Videos' && <Library videos={videos} onSave={act(saveVideo)} onDelete={act(deleteVideo)} onSynced={load} />}
        {tab === 'Widgets' && <Widgets videos={videos} />}
        {tab === 'Analytics' && <Analytics videos={videos} />}
      </main>
    </div>
  );
}

function Login({ onDone }) {
  const [t, setT] = useState('');
  return (
    <div className="overlay" style={{ background: '#faf7f8' }}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); setToken(t.trim()); onDone(); }}>
        <h2>Tuco Videos</h2>
        <label>Admin token<input type="password" autoFocus value={t} onChange={(e) => setT(e.target.value)} /></label>
        <button className="btn">Sign in</button>
      </form>
    </div>
  );
}
