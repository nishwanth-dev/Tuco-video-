const STEPS = [
  ['Add videos', 'Upload a file or sync Instagram.', 'videos', (c) => c.videos.length > 0],
  ['Tag products', 'Link each video to the products it features.', 'videos', (c) => c.videos.some((v) => v.products.length)],
  ['Set videos live', 'Switch tagged videos from draft to live.', 'videos', (c) => c.videos.some((v) => v.status === 'live')],
  ['Create a widget', 'Carousel, stories, banner or floating video.', 'w:home', (c) => c.widgets.length > 0],
  ['Add the embed code', 'Paste it into a Custom Liquid section on the Teen page testing theme first.', 'w:home', () => false],
];
export default function Home(c) {
  return (
    <>
      <div className="bar"><div><h1>Welcome back</h1><p className="sub">Set up shoppable videos for tucokids.com in five steps.</p></div></div>
      <div className="steps">{STEPS.map(([t, d, to, done], i) => {
        const ok = done(c);
        return <button key={t} className={'step' + (ok ? ' ok' : '')} onClick={() => c.go(to)}><span className="num">{ok ? '✓' : i + 1}</span><div><b>{t}</b><p>{d}</p></div></button>;
      })}</div>
      <div className="stats">
        <div className="stat"><span>Videos</span><b>{c.videos.length}</b></div>
        <div className="stat"><span>Live</span><b>{c.videos.filter((v) => v.status === 'live').length}</b></div>
        <div className="stat"><span>Widgets</span><b>{c.widgets.length}</b></div>
      </div>
    </>
  );
}
