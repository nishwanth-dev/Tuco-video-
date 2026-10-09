// Full-screen loading screen: same look as the splash in index.html (styles live there).
export default function Loader() {
  return (
    <div className="splash" role="status" aria-label="Loading Loopy">
      <svg viewBox="0 0 48 48" width="76" height="76" aria-hidden="true">
        <rect width="48" height="48" rx="14" fill="#18181b" />
        <g className="ring">
          <path d="M24 10.5a13.5 13.5 0 1 0 13 9.8" fill="none" stroke="#ffd94a" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="36.5" cy="12.5" r="2.7" fill="#ffd94a" />
        </g>
        <path className="tri" d="M21 18.2v11.6l9.6-5.8z" fill="#fff" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <div className="word">loopy</div>
      <div className="bar"><i /></div>
    </div>
  );
}
