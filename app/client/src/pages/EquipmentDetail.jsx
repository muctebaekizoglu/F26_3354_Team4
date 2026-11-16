import React, { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import OverrideModal from '../components/OverrideModal.jsx';
import usePolling from '../usePolling.js';

export default function EquipmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);
  const [overrideLock, setOverrideLock] = useState(null);
  const [overrideError, setOverrideError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.equipmentDetail(id));
      setFailed(false); setLoadError('');
    } catch (err) {
      if (err.status === 404) setLoadError(err.message); else setFailed(true);
    }
  }, [id]);
  usePolling(load, 5000);

  async function run(fn, okText) {
    setBusy(true); setMessage(null);
    try {
      await fn();
      setMessage({ kind: 'ok', text: okText });
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
      throw err;
    } finally {
      setBusy(false);
      load();
    }
  }

  if (loadError) return <main className="page" id="main"><div className="alert alert-error" role="alert">{loadError}</div><Link to="/">Back to dashboard</Link></main>;
  if (!data) return <main className="page" id="main">{failed ? <div className="alert alert-error" role="alert"><strong>Warning:</strong> status unavailable. Treat this equipment as LOCKED / UNKNOWN.</div> : <p>Loading…</p>}</main>;

  const { equipment: eq, permissions } = data;
  const status = failed ? 'UNKNOWN' : eq.status;
  const mine = eq.activeLocks.find((l) => l.workerId === user.userId);
  const retired = eq.status === 'RETIRED';

  let applyHint = '';
  if (retired) applyHint = 'This equipment is retired and cannot be locked.';
  else if (mine) applyHint = 'You already hold a lock on this equipment.';
  else if (!permissions.canApply) applyHint = user.role === 'ADMIN'
    ? 'Admins do not apply locks.' : 'You are not authorized to lock this equipment. Ask an administrator to grant access.';
  const applyDisabled = busy || failed || !!applyHint;

  return (
    <main className="page" id="main">
      <p className="crumb"><Link to="/">← Dashboard</Link></p>
      <div className="title-row">
        <h1>{eq.name}</h1>
        <StatusBadge status={status} />
      </div>
      <p className="muted">{eq.location}</p>

      {failed && <div className="alert alert-error" role="alert"><strong>Warning:</strong> the latest status could not be loaded. Treat this equipment as LOCKED.</div>}
      {message && <div className={`alert ${message.kind === 'ok' ? 'alert-ok' : 'alert-error'}`} role={message.kind === 'ok' ? 'status' : 'alert'}>{message.text}</div>}

      <section className="card" aria-labelledby="apply-title">
        <h2 id="apply-title">Your lock</h2>
        <button className="btn btn-primary" disabled={applyDisabled} aria-describedby={applyHint ? 'apply-hint' : undefined}
          onClick={() => run(() => api.applyLock(eq.equipmentId), 'Your lock was applied.').catch(() => {})}>
          Apply My Lock
        </button>
        {applyHint && <p id="apply-hint" className="hint">{applyHint}</p>}
        <p className="muted">This equipment stays <strong>LOCKED</strong> until <strong>every</strong> lock has been released. Each worker removes only their own lock.</p>
      </section>

      <section className="card" aria-labelledby="locks-title">
        <h2 id="locks-title">Active locks ({failed ? '?' : eq.activeLocks.length})</h2>
        {eq.activeLocks.length === 0 ? <p>{failed ? 'Unknown' : 'No active locks.'}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Owner</th><th>Applied</th><th>Action</th></tr></thead>
              <tbody>
                {eq.activeLocks.map((l) => {
                  const own = l.workerId === user.userId;
                  return (
                    <tr key={l.lockId}>
                      <td>{l.workerName}{own ? ' (you)' : ''}</td>
                      <td>{new Date(l.appliedAt).toLocaleString()}</td>
                      <td className="actions">
                        {own ? (
                          <button className="btn btn-primary" disabled={busy}
                            onClick={() => run(() => api.releaseLock(l.lockId), 'Your lock was released.').catch(() => {})}>Release My Lock</button>
                        ) : (
                          <>
                            <button className="btn" disabled>Only {l.workerName} can release</button>
                            {permissions.canOverride && (
                              <button className="btn btn-danger-outline" disabled={busy} onClick={() => { setOverrideError(''); setOverrideLock(l); }}>Override</button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {overrideLock && (
        <OverrideModal
          lock={overrideLock} equipmentName={eq.name} busy={busy} error={overrideError}
          onCancel={() => setOverrideLock(null)}
          onConfirm={async (reason) => {
            setBusy(true); setOverrideError('');
            try {
              await api.override(overrideLock.lockId, reason);
              setOverrideLock(null);
              setMessage({ kind: 'ok', text: `Override recorded: ${overrideLock.workerName}'s lock was removed.` });
              load();
            } catch (err) { setOverrideError(err.message); } finally { setBusy(false); }
          }}
        />
      )}
    </main>
  );
}
