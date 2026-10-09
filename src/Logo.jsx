// Loopy mark: a loop with a play button inside, plus the wordmark.
export default function Logo({ size = 28, text = true }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <rect width="48" height="48" rx="14" fill="#18181b" />
        <path d="M24 10.5a13.5 13.5 0 1 0 13 9.8" fill="none" stroke="#ffd94a" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="36.5" cy="12.5" r="2.7" fill="#ffd94a" />
        <path d="M21 18.2v11.6l9.6-5.8z" fill="#fff" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      {text && <span className="logo-t">loopy</span>}
    </span>
  );
}
