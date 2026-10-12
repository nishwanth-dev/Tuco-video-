// The Loopy helper mascot: a cloud-headed robot with a screen face. Styles live in styles.css (.mascot*).
// variant "head" shows only the face (for small avatars); "full" shows the whole robot, waving when wave is true.
export default function Mascot({ size = 96, variant = 'full', wave = false, bob = true, className = '' }) {
  const head = variant === 'head';
  return (
    <svg className={`mascot ${bob ? 'bob' : ''} ${wave ? 'wave' : ''} ${className}`} viewBox={head ? '12 6 96 78' : '0 0 120 144'} width={head ? size : size} height={head ? size * (78 / 96) : size * 1.2} role="img" aria-label="Loopy helper">
      {!head && <ellipse className="m-shadow" cx="60" cy="136" rx="26" ry="5" fill="rgba(24,24,27,.14)" />}
      <g className="m-body">
        {!head && (
          <>
            <rect x="43" y="108" width="12" height="16" rx="6" fill="#f0c230" />
            <rect x="65" y="108" width="12" height="16" rx="6" fill="#f0c230" />
            <rect x="42" y="82" width="36" height="32" rx="15" fill="#ffd94a" stroke="#f0c230" strokeWidth="2" />
            <circle cx="60" cy="98" r="8" fill="#18181b" />
            <path d="M58 94.4v7.2l6-3.6z" fill="#fff" />
            <circle cx="37" cy="97" r="6.5" fill="#f0c230" />
            <g className="m-arm"><rect x="76" y="86" width="18" height="12" rx="6" fill="#f0c230" /><circle cx="93" cy="92" r="6.5" fill="#f0c230" /></g>
          </>
        )}
        <g className="m-head">
          <g fill="#f0c230">
            <rect x="19" y="20" width="82" height="62" rx="29" /><circle cx="33" cy="28" r="17" /><circle cx="60" cy="19" r="19" /><circle cx="88" cy="28" r="17" /><circle cx="22" cy="54" r="15" /><circle cx="98" cy="54" r="15" />
          </g>
          <g fill="#ffd94a">
            <rect x="21" y="22" width="78" height="58" rx="27" /><circle cx="33" cy="29" r="15.5" /><circle cx="60" cy="20" r="17.5" /><circle cx="88" cy="29" r="15.5" /><circle cx="23" cy="54" r="13.5" /><circle cx="97" cy="54" r="13.5" />
          </g>
          <rect x="30" y="34" width="60" height="38" rx="15" fill="#18181b" />
          <g className="m-eyes" fill="#fff"><rect x="43" y="44" width="9" height="13" rx="4.5" /><rect x="68" y="44" width="9" height="13" rx="4.5" /></g>
          <path d="M53 63.5q7 5 14 0" fill="none" stroke="#ffd94a" strokeWidth="3" strokeLinecap="round" />
          <circle cx="38" cy="62" r="3.4" fill="#ff9ab8" opacity=".85" /><circle cx="82" cy="62" r="3.4" fill="#ff9ab8" opacity=".85" />
        </g>
      </g>
    </svg>
  );
}
