import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusChart from '../components/StatusChart.jsx';
import usePolling from '../usePolling.js';

export default function Dashboard() {
  const [equipment, setEquipment] = useState(null);
  const [failed, setFailed] = useState(false);
  const [banners, setBanners] = useState([]);
  const [updated, setUpdated] = useState(null);

  usePolling(useCallback(async () => {
    try {
      const r = await api.equipment();
      setEquipment(r.equipment);
      setFailed(false);
      setUpdated(new Date());
    } catch {
      setFailed(true); // fail-safe: never show UNLOCKED when the status is unknown
    }
    try {
      const n = await api.notifications();
      setBanners(n.notifications);
    } catch { /* banners are best-effort */ }
  }, []), 5000);

  async function dismiss(id) {
    setBanners((b) => b.filter((x) => x.notificationId !== id));
    try { await api.markRead(id); } catch { /* ignore */ }
  }

  const rows = equipment ?? [];
  const statusOf = (e) => (failed ? 'UNKNOWN' : e.status);
  const locked = rows.filter((e) => statusOf(e) === 'LOCKED' || statusOf(e) === 'UNKNOWN').length;
  const unlocked = rows.filter((e) => statusOf(e) === 'UNLOCKED').length;

  return (
    <main className="page" id="main">
      <h1>Equipment Status</h1>

      <div aria-live="polite">
        {banners.map((n) => (
          <div className="banner" key={n.notificationId} role="status">
            <span><strong>Status change:</strong> {n.message}</span>
            <button className="btn btn-small" onClick={() => dismiss(n.notificationId)} aria-label={`Dismiss: ${n.message}`}>Dismiss</button>
          </div>
        ))}
      </div>

      {failed && (
        <div className="alert alert-error" role="alert">
          <strong>Warning:</strong> the latest status could not be loaded. Treat all equipment as LOCKED until the connection is restored.
        </div>
      )}

      <div className="dash-grid">
        <section className="card" aria-labelledby="eq-title">
          <div className="card-head">
            <h2 id="eq-title">All equipment</h2>
            <span className="muted small">{updated && !failed ? `Updated ${updated.toLocaleTimeString()} · refreshes every 5 s` : 'Refreshes every 5 s'}</span>
          </div>
          {equipment === null && !failed ? <p>Loading…</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Equipment</th><th>Location</th><th>Status</th><th>Current lock holders</th></tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.equipmentId}>
                      <td><Link to={`/equipment/${e.equipmentId}`}>{e.name}</Link></td>
                      <td>{e.location}</td>
                      <td><StatusBadge status={statusOf(e)} /></td>
                      <td>{failed ? 'Unknown' : e.activeLocks.length ? e.activeLocks.map((l) => l.workerName).join(', ') : '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4}>Status unavailable.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="chart-title">
          <h2 id="chart-title">Locked vs. Unlocked</h2>
          <StatusChart locked={locked} unlocked={unlocked} unknown={failed} />
          <p className="muted small">Total equipment: {rows.length}</p>
        </section>
      </div>
    </main>
  );
}
