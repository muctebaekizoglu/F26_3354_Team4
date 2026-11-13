import React from 'react';

// Plain-SVG donut. Counts are also written as text so colour is never the only signal.
export default function StatusChart({ locked, unlocked, unknown }) {
  const total = locked + unlocked;
  const r = 52;
  const c = 2 * Math.PI * r;
  const lockedLen = total ? (locked / total) * c : 0;
  const label = unknown
    ? `Status unknown for ${locked} equipment items; treated as locked`
    : `${locked} locked and ${unlocked} unlocked out of ${total} items`;
  return (
    <div className="chart">
      <svg viewBox="0 0 140 140" width="160" height="160" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1b7a3d" strokeWidth="20" />
        {lockedLen > 0 && (
          <circle cx="70" cy="70" r={r} fill="none" stroke="#b42318" strokeWidth="20"
            strokeDasharray={`${lockedLen} ${c - lockedLen}`} transform="rotate(-90 70 70)" />
        )}
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">{locked}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="currentColor">LOCKED</text>
      </svg>
      <ul className="legend">
        <li><span className="swatch swatch-locked" aria-hidden="true" /> {unknown ? 'LOCKED / UNKNOWN' : 'LOCKED'}: <strong>{locked}</strong></li>
        <li><span className="swatch swatch-unlocked" aria-hidden="true" /> UNLOCKED: <strong>{unlocked}</strong></li>
      </ul>
    </div>
  );
}
