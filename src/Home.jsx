import { useEffect, useState } from 'react';
import { getAnalytics } from './api.js';

const STEPS = [
  ['Add videos', 'Upload a file or sync Instagram.', 'videos', (c) => c.videos.length > 0],
  ['Tag products', 'Link each video to the products it features.', 'videos', (c) => c.videos.some((v) => v.products.length)],
  ['Set videos live', 'Switch tagged videos from draft to live.', 'videos', (c) => c.videos.some((v) => v.status === 'live')],
  ['Create a widget', 'Carousel, stories, banner or floating video.', 'w:home', (c) => c.widgets.length > 0],
  ['Add the embed code', 'Paste it into a Custom Liquid section on the Teen page testing theme first.', 'w:home', () => false],
];
const EMPTY = { perVideo: [], daily: [], salesByVideo: [], sales: { orders: 0, revenue: 0 }, storeSales: null };
const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');

export default function Home(c) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const { setError } = c;
  useEffect(() => { setLoaded(false); getAnalytics(days).then((x) => { setD({ ...EMPTY, ...x }); setLoaded(true); }).catch((e) => setError(e.message)); }, [days, setError]);

  const t = d.perVideo.reduce((a, r) => ({ imp: a.imp + (r.impressions || 0), plays: a.plays + (r.plays || 0), secs: a.secs + (r.secs || 0), atc: a.atc + (r.atc || 0) }), { imp: 0, plays: 0, secs: 0, atc: 0 });
  const max = Math.max(1, ...d.daily.map((x) => x.plays));
  const top = d.perVideo.filter((r) => r.plays).sort((a, b) => b.plays - a.plays).slice(0, 3)
    .map((r) => ({ ...r, v: c.videos.find((v) => v.id === r.video_id), sale: d.salesByVideo?.find((s) => s.video_id === r.video_id) }));
  const share = d.storeSales && d.storeSales.revenue ? ((d.sales.revenue / d.storeSales.revenue) * 100).toFixed(1) + '% of total' : '';

  const doneCount = STEPS.slice(0, 4).filter(([, , , f]) => f(c)).length;
  const heavy = c.videos.filter((v) => v.status === 'live' && v.size > 15 * 1048576).length;
  const msg = !c.videos.length ? ['Let\'s get your first video in.', 'Upload a short clip or sync Instagram, and Loopy will shrink it for fast loading.']
    : t.plays ? ['Shoppers are watching your videos.', `${plural(t.plays, 'view')} and ${t.atc} add to cart in the last ${days} days.`]
    : heavy ? [`${heavy} live video${heavy === 1 ? ' is' : 's are'} heavy.`, 'Shrink it so your pages stay fast. Use Make smaller when you add a video.']
    : ['You are set up. Waiting for the first views.', 'Add the widget to your theme and activity will show here.'];

  return (
    <>
      <div className="bar"><div><h1>Welcome back</h1><p className="sub">Shoppable videos for tucokids.com, hosted by you.</p></div>
        <div className="row"><button className="btn ghost" onClick={() => c.go('custom')}>How it looks</button><button className="btn ghost" onClick={() => c.go('integrations')}>System check</button></div></div>

      <div className="homegrid">
        <div className="hleft">
          <div className="fcards">
            <button className="fcard" onClick={() => c.go('videos')}><i className="fart a" /><b>Add videos</b><p>Upload a file or sync Instagram. Big files can be shrunk right in the browser.</p><span className="fbtn">{c.videos.length ? 'Open videos' : 'Add now'} →</span></button>
            <button className="fcard" onClick={() => c.go('w:home')}><i className="fart b" /><b>Build a widget</b><p>Carousel, stories, banner, spotlight, floating or gallery. Choose where it shows.</p><span className="fbtn">{c.widgets.length ? 'Manage widgets' : 'Create'} →</span></button>
            <button className="fcard" onClick={() => c.go('custom')}><i className="fart c" /><b>Make it yours</b><p>Sizes, shapes and colours for desktop and mobile, with a live preview.</p><span className="fbtn">Customize →</span></button>
          </div>
          <div className="hbanner"><div className="hico">✦</div><div><b>{msg[0]}</b><p>{msg[1]}</p></div><button className="btn ghost" onClick={() => c.go('analytics')}>View analytics</button></div>
          <div className="phead"><h3 className="sect">Setup checklist</h3><span className="muted small">{doneCount} of 4 done</span></div>
          <div className="steps">{STEPS.map(([t2, desc, to, done], i) => {
            const ok = done(c);
            return <button key={t2} className={'step' + (ok ? ' ok' : '')} onClick={() => c.go(to)}><span className="num">{ok ? '✓' : i + 1}</span><div><b>{t2}</b><p>{desc}</p></div></button>;
          })}</div>
        </div>

        <aside className="hright">
          <div className="pcard">
            <div className="phead"><div><h3>Performance Overview</h3><small className="muted">Last {days} days</small></div>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</select></div>
            <div className="psec"><h4><i className="dot a" />Sales</h4>
              <div className="pgrid"><div><span>Whole store</span><b>{d.storeSales ? rupees(d.storeSales.revenue) : '-'}</b><small>{d.storeSales ? plural(d.storeSales.orders, 'order') : 'Not connected'}</small></div>
                <div className="hl"><span>Video sales</span><b>{d.sales.revenue ? rupees(d.sales.revenue) : loaded ? '₹0' : '-'}</b><small>{share || plural(d.sales.orders, 'order')}</small></div></div>
              {!d.storeSales && <button className="link" onClick={() => c.go('integrations')}>Connect the order webhook →</button>}</div>
            <div className="psec"><h4><i className="dot b" />Viewer activity</h4>
              <div className="pgrid"><div><span>Impressions</span><b>{t.imp}</b><small>times a widget was seen</small></div><div><span>Video views</span><b>{t.plays}</b><small>{pct(t.plays, t.imp)} of impressions</small></div>
                <div><span>Add to cart</span><b>{t.atc}</b><small>{pct(t.atc, t.plays)} of views</small></div><div><span>Avg watch</span><b>{t.plays ? Math.round(t.secs / t.plays) + 's' : '-'}</b><small>per view</small></div></div></div>
            <div className="psec"><div className="phead"><h4>Views per day</h4><button className="link" onClick={() => c.go('analytics')}>See all →</button></div>
              <div className="chart small">{d.daily.length ? d.daily.map((x) => <div key={x.day} className="bar1" title={`${x.day}: ${x.plays} views, ${x.atc} add to cart`}><i style={{ height: (x.plays / max) * 100 + '%' }} /></div>) : <p className="muted pad">{loaded ? 'No views yet.' : 'Loading...'}</p>}</div></div>
            <div className="psec"><h4>Top videos</h4>
              {top.length ? top.map((r) => <div className="trow" key={r.video_id}><span>{r.v?.title || 'Deleted video'}</span><b>{plural(r.plays, 'view')}</b><small>{r.atc} add to cart{r.sale?.revenue ? ' · ' + rupees(r.sale.revenue) : ''}</small></div>)
                : <p className="muted pad">{loaded ? 'Nothing watched yet.' : 'Loading...'}</p>}</div>
          </div>
        </aside>
      </div>
    </>
  );
}
