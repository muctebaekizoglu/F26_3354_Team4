import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const ACTIONS = [
  'LOCK_APPLIED', 'LOCK_RELEASED', 'LOCK_DENIED', 'RELEASE_DENIED', 'LOCK_OVERRIDDEN', 'OVERRIDE_DENIED',
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'REPORT_EXPORTED', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED',
  'EQUIPMENT_ADDED', 'EQUIPMENT_UPDATED', 'EQUIPMENT_RETIRED', 'RETIRE_REFUSED', 'AUTHORIZATION_GRANTED', 'AUTHORIZATION_REVOKED',
];

const EMPTY = { from: '', to: '', equipmentId: '', workerId: '', action: '' };

// Local calendar days -> ISO instants for the API.
function toApi(f) {
  return {
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : '',
    to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : '',
    equipmentId: f.equipmentId, workerId: f.workerId, action: f.action,
  };
}

export default function Report() {
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [report, setReport] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [actors, setActors] = useState([]);
  const [chain, setChain] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.equipment().then((r) => setEquipment(r.equipment)).catch(() => {});
    api.auditActors().then((r) => setActors(r.actors)).catch(() => {});
  }, []);

  const run = useCallback(async (filters) => {
    setBusy(true); setError('');
    try {
      const [r, v] = await Promise.all([api.audit(toApi(filters)), api.auditVerify()]);
      setReport(r); setChain(v); setApplied(filters);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }, []);

  useEffect(() => { run(EMPTY); }, [run]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function exportCsv() {
    setError('');
    try {
      const { blob } = await api.auditExport(toApi(applied));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'loto-compliance-report.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  }

  return (
    <main className="page" id="main">
      <h1>Compliance Report</h1>
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); run(form); }} aria-label="Report filters">
        <div className="field"><label htmlFor="f-from">From</label><input id="f-from" type="date" value={form.from} onChange={set('from')} /></div>
        <div className="field"><label htmlFor="f-to">To</label><input id="f-to" type="date" value={form.to} onChange={set('to')} /></div>
        <div className="field">
          <label htmlFor="f-eq">Equipment</label>
          <select id="f-eq" value={form.equipmentId} onChange={set('equipmentId')}>
            <option value="">All equipment</option>
            {equipment.map((e) => <option key={e.equipmentId} value={e.equipmentId}>{e.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-worker">Worker</label>
          <select id="f-worker" value={form.workerId} onChange={set('workerId')}>
            <option value="">All people</option>
            {actors.map((a) => <option key={a.userId} value={a.userId}>{a.fullName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-action">Action type</label>
          <select id="f-action" value={form.action} onChange={set('action')}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field field-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>Apply filters</button>
          <button className="btn" type="button" onClick={() => { setForm(EMPTY); run(EMPTY); }}>Reset</button>
        </div>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card" aria-labelledby="res-title">
        <div className="card-head">
          <h2 id="res-title">Results <span className="count" data-testid="result-count">{report ? `${report.count} entries` : ''}</span></h2>
          <div className="head-actions">
            {chain && <span className={`chain ${chain.valid ? 'chain-ok' : 'chain-bad'}`}>{chain.valid ? `Hash chain verified (${chain.entries} entries)` : `Hash chain BROKEN at entry ${chain.brokenAt}`}</span>}
            <button className="btn" onClick={exportCsv} disabled={!report}>Export CSV</button>
          </div>
        </div>
        {report && report.truncated && <div className="alert alert-warn">Showing the newest {report.count} of {report.total} entries.</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Equipment</th><th>Details</th></tr></thead>
            <tbody>
              {report && report.entries.map((e) => (
                <tr key={e.entryId}>
                  <td className="nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                  <td>{e.actorName ?? '—'}</td>
                  <td><code className="action">{e.action}</code></td>
                  <td>{e.equipmentName ?? '—'}</td>
                  <td>{e.details || '—'}</td>
                </tr>
              ))}
              {report && report.entries.length === 0 && <tr><td colSpan={5}>No entries match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
