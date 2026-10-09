import { useState } from 'react';
import { listEvents, clearEvents } from './api.js';

export default function Analytics({ videos }) {
  const [events, setEvents] = useState(listEvents);
  const rows = videos.map((v) => {
    const mine = events.filter((e) => e.videoId === v.id);
    const plays = mine.filter((e) => e.type === 'play').length;
    const secs = mine.filter((e) => e.type === 'watch').reduce((s, e) => s + e.secs, 0);
    const atc = mine.filter((e) => e.type === 'atc').length;
    return { v, plays, secs, atc };
  });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);

  return (
    <>
      <div className="bar"><h1>Analytics</h1><button className="link red" onClick={() => { clearEvents(); setEvents([]); }}>Reset demo data</button></div>
      <div className="stats">
        <div className="stat"><span>Plays</span><b>{sum('plays')}</b></div>
        <div className="stat"><span>Watch time</span><b>{Math.round(sum('secs'))}s</b></div>
        <div className="stat"><span>Add to cart</span><b>{sum('atc')}</b></div>
      </div>
      <table>
        <thead><tr><th>Video</th><th>Plays</th><th>Avg watch</th><th>Add to cart</th></tr></thead>
        <tbody>{rows.map(({ v, plays, secs, atc }) => (
          <tr key={v.id}><td>{v.title}</td><td>{plays}</td><td>{plays ? (secs / plays).toFixed(1) + 's' : '-'}</td><td>{atc}</td></tr>
        ))}</tbody>
      </table>
    </>
  );
}
