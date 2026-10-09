import { useEffect, useState } from 'react';
import { getAnalytics, clearEvents, isLive } from './api.js';

export default function Analytics({ videos }) {
  const [data, setData] = useState([]);
  const load = () => getAnalytics().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const rows = videos.map((v) => ({ v, ...(data.find((d) => d.video_id === v.id) || { plays: 0, secs: 0, atc: 0 }) }));
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

  return (
    <>
      <div className="bar"><h1>Analytics</h1>{!isLive && <button className="link red" onClick={() => { clearEvents(); load(); }}>Reset demo data</button>}</div>
      <div className="stats">
        <div className="stat"><span>Plays</span><b>{sum('plays')}</b></div>
        <div className="stat"><span>Watch time</span><b>{Math.round(sum('secs'))}s</b></div>
        <div className="stat"><span>Add to cart</span><b>{sum('atc')}</b></div>
      </div>
      <table>
        <thead><tr><th>Video</th><th>Plays</th><th>Avg watch</th><th>Add to cart</th><th>Cart rate</th></tr></thead>
        <tbody>{rows.map(({ v, plays, secs, atc }) => (
          <tr key={v.id}><td>{v.title}</td><td>{plays}</td><td>{plays ? (secs / plays).toFixed(1) + 's' : '-'}</td><td>{atc}</td><td>{plays ? ((atc / plays) * 100).toFixed(1) + '%' : '-'}</td></tr>
        ))}</tbody>
      </table>
    </>
  );
}
