import React from 'react';

// Status is always text, never colour alone.
const LABELS = { LOCKED: 'LOCKED', UNLOCKED: 'UNLOCKED', RETIRED: 'RETIRED', UNKNOWN: 'LOCKED / UNKNOWN' };

export default function StatusBadge({ status }) {
  const key = LABELS[status] ? status : 'UNKNOWN';
  return <span className={`badge badge-${key.toLowerCase()}`}>{LABELS[key]}</span>;
}
