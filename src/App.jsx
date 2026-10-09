import { useState } from 'react';
import { listVideos, saveVideo, deleteVideo } from './api.js';
import Library from './Library.jsx';
import Widgets from './Widgets.jsx';
import Analytics from './Analytics.jsx';

const TABS = ['Videos', 'Widgets', 'Analytics'];

export default function App() {
  const [tab, setTab] = useState('Videos');
  const [videos, setVideos] = useState(listVideos);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Tuco Videos</div>
        {TABS.map((t) => (
          <button key={t} className={'nav' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </aside>
      <main className="main">
        {tab === 'Videos' && <Library videos={videos} onSave={(v) => setVideos(saveVideo(v))} onDelete={(id) => setVideos(deleteVideo(id))} />}
        {tab === 'Widgets' && <Widgets videos={videos} />}
        {tab === 'Analytics' && <Analytics videos={videos} />}
      </main>
    </div>
  );
}
