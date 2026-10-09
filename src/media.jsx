// YouTube links show a thumbnail or embed; everything else uses a normal video element.
export const ytId = (u) => ((String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/) || [])[1] || '');

export function Thumb({ url, hover = false, ...rest }) {
  const id = ytId(url);
  if (id) return <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" {...rest} />;
  return <video src={url + '#t=0.1'} muted playsInline preload="metadata" {...(hover ? { onMouseEnter: (e) => e.target.play().catch(() => {}), onMouseLeave: (e) => e.target.pause() } : {})} {...rest} />;
}

export function Player({ url, ...rest }) {
  const id = ytId(url);
  if (id) return <iframe src={`https://www.youtube.com/embed/${id}?rel=0`} allow="encrypted-media; picture-in-picture" allowFullScreen title="Video" {...rest} />;
  return <video src={url} controls playsInline {...rest} />;
}
