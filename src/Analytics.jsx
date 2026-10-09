import { useEffect, useMemo, useState } from 'react';
import { getAnalytics } from './api.js';

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const fmtTime = (s) => (s >= 3600 ? (s / 3600).toFixed(1) + ' hrs' : s >= 60 ? Math.round(s / 60) + ' min' : Math.round(s) + 's');

export default function Analytics({ videos, widgets, setError }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState({ perVideo: [], perWidget: [], daily: [] });
  useEffect(() => { getAnalytics(days).then(setData).catch((e) => setError(e.message)); }, [days, setError]);

  const t = useMemo(() => data.perVideo.reduce((a, r) => ({ imp: a.imp + (r.impressions || 0), plays: a.plays + (r.plays || 0), secs: a.secs + (r.secs || 0), atc: a.atc + (r.atc || 0), likes: a.likes + (r.likes || 0), shares: a.shares + (r.shares || 0) }), { imp: 0, plays: 0, secs: 0, atc: 0, likes: 0, shares: 0 }), [data]);
  const max = Math.max(1, ...data.daily.map((d) => d.plays));
  const rows = videos.map((v) => ({ v, ...(data.perVideo.find((r) => r.video_id === v.id) || {}) })).filter((r) => r.plays || r.impressions).sort((a, b) => (b.plays || 0) - (a.plays || 0));

  return (
    <>
      <div className="bar"><div><h1>Analytics</h1><p className="sub">How shoppers watch your videos and what they add to cart.</p></div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></div>
      <div className="stats s6">
        <div className="stat"><span>Impressions</span><b>{t.imp}</b></div>
        <div className="stat"><span>Video views</span><b>{t.plays}</b></div>
        <div className="stat"><span>Watch time</span><b>{fmtTime(t.secs)}</b><small>{t.plays ? Math.round(t.secs / t.plays) + 's per view' : ''}</small></div>
        <div className="stat"><span>Add to cart</span><b>{t.atc}</b><small>{pct(t.atc, t.plays)} of views</small></div>
        <div className="stat"><span>Likes</span><b>{t.likes}</b></div>
        <div className="stat"><span>Shares</span><b>{t.shares}</b></div>
      </div>
      <h3 className="sect">Views per day</h3>
      <div className="chart">{data.daily.length ? data.daily.map((d) => <div key={d.day} className="bar1" title={`${d.day}: ${d.plays} views, ${d.atc} add to cart`}><i style={{ height: (d.plays / max) * 100 + '%' }} /><span>{d.day.slice(5)}</span></div>) : <p className="muted pad">No views recorded in this period yet.</p>}</div>
      <h3 className="sect">How shoppers reach your videos</h3>
      <table><thead><tr><th>Widget</th><th>Impressions</th><th>Views</th><th>View rate</th><th>Add to cart</th><th>Cart rate</th></tr></thead>
        <tbody>{data.perWidget.map((r) => <tr key={r.widget}><td>{widgets.find((w) => w.id === r.widget)?.name || r.widget}</td><td>{r.impressions}</td><td>{r.plays}</td><td>{pct(r.plays, r.impressions)}</td><td>{r.atc}</td><td>{pct(r.atc, r.plays)}</td></tr>)}
          {!data.perWidget.length && <tr><td colSpan="6" className="muted">No widget traffic yet.</td></tr>}</tbody></table>
      <h3 className="sect">Video performance</h3>
      <table><thead><tr><th>Video</th><th>Impressions</th><th>Views</th><th>Avg watch</th><th>Add to cart</th><th>Cart rate</th><th>Likes</th><th>Shares</th></tr></thead>
        <tbody>{rows.map(({ v, impressions = 0, plays = 0, secs = 0, atc = 0, likes = 0, shares = 0 }) => <tr key={v.id}><td>{v.title}</td><td>{impressions}</td><td>{plays}</td><td>{plays ? (secs / plays).toFixed(1) + 's' : '-'}</td><td>{atc}</td><td>{pct(atc, plays)}</td><td>{likes}</td><td>{shares}</td></tr>)}
          {!rows.length && <tr><td colSpan="8" className="muted">No video activity yet.</td></tr>}</tbody></table>
      <p className="muted pad">Sales from video sessions needs Shopify order data and is not connected yet. Add to cart is tracked now, and each cart line carries a _tuco_video property.</p>
    </>
  );
}
