import React, { useEffect, useRef, useState } from 'react';

// Supervisor override dialog (FR-7). The reason is mandatory; the server enforces it too.
export default function OverrideModal({ lock, equipmentName, onCancel, onConfirm, busy, error }) {
  const [reason, setReason] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="override-title">
        <h2 id="override-title">Supervisor override</h2>
        <p>
          You are about to remove <strong>{lock.workerName}</strong>&apos;s lock on <strong>{equipmentName}</strong>.
          This is recorded in the audit log together with your reason.
        </p>
        <label htmlFor="override-reason">Reason (required)</label>
        <textarea
          id="override-reason" ref={ref} rows={4} value={reason} required
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Worker left site; area verified safe"
        />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" disabled={reason.trim() === '' || busy} onClick={() => onConfirm(reason)}>
            {busy ? 'Overriding…' : 'Confirm override'}
          </button>
        </div>
      </div>
    </div>
  );
}
