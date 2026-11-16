import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const ROLES = ['WORKER', 'SUPERVISOR', 'ADMIN'];

function useNotice() {
  const [notice, setNotice] = useState(null);
  const node = notice && (
    <div className={`alert ${notice.kind === 'error' ? 'alert-error' : 'alert-ok'}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</div>
  );
  return [setNotice, node];
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', fullName: '', role: 'WORKER' });
  const [setNotice, notice] = useNotice();
  const load = useCallback(() => api.admin.users().then((r) => setUsers(r.users)).catch((e) => setNotice({ kind: 'error', text: e.message })), [setNotice]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okText) {
    try { const r = await fn(); setNotice({ kind: 'ok', text: typeof okText === 'function' ? okText(r) : okText }); } catch (e) { setNotice({ kind: 'error', text: e.message }); }
    load();
  }

  return (
    <>
      {notice}
      <form className="card filters" onSubmit={(e) => {
        e.preventDefault();
        act(() => api.admin.createUser(form), (r) => `User ${r.user.username} created. Temporary password: ${r.user.tempPassword} (shown once).`)
          .then(() => setForm({ username: '', fullName: '', role: 'WORKER' }));
      }} aria-label="Create user">
        <div className="field"><label htmlFor="u-name">Username</label><input id="u-name" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
        <div className="field"><label htmlFor="u-full">Full name</label><input id="u-full" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </div>
        <div className="field field-actions"><button className="btn btn-primary" type="submit" disabled={!form.username || !form.fullName}>Create user</button></div>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId}>
                <td>{u.fullName}</td>
                <td>{u.username}</td>
                <td>
                  <select aria-label={`Role for ${u.fullName}`} value={u.role} disabled={u.userId === me.userId}
                    onChange={(e) => act(() => api.admin.updateUser(u.userId, { role: e.target.value }), `${u.fullName} is now ${e.target.value}.`)}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td><span className={`pill ${u.isActive ? 'pill-active' : 'pill-inactive'}`}>{u.isActive ? 'ACTIVE' : 'DEACTIVATED'}</span></td>
                <td>
                  {u.isActive
                    ? <button className="btn btn-danger-outline" disabled={u.userId === me.userId} onClick={() => act(() => api.admin.deactivateUser(u.userId), `${u.fullName} was deactivated.`)}>Deactivate</button>
                    : <button className="btn" onClick={() => act(() => api.admin.updateUser(u.userId, { isActive: true }), `${u.fullName} was reactivated.`)}>Reactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EquipmentTab() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', location: '' });
  const [editing, setEditing] = useState(null); // { id, name, location }
  const [confirming, setConfirming] = useState(null);
  const [setNotice, notice] = useNotice();
  const load = useCallback(() => api.admin.equipment().then((r) => setItems(r.equipment)).catch((e) => setNotice({ kind: 'error', text: e.message })), [setNotice]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okText) {
    try { await fn(); setNotice({ kind: 'ok', text: okText }); } catch (e) { setNotice({ kind: 'error', text: e.message }); }
    setConfirming(null); setEditing(null);
    load();
  }

  return (
    <>
      {notice}
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); act(() => api.admin.addEquipment(form), `${form.name} added.`).then(() => setForm({ name: '', location: '' })); }} aria-label="Add equipment">
        <div className="field"><label htmlFor="e-name">Name</label><input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="e-loc">Location</label><input id="e-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div className="field field-actions"><button className="btn btn-primary" type="submit" disabled={!form.name || !form.location}>Add equipment</button></div>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Equipment</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((e) => {
              const isEditing = editing?.id === e.equipmentId;
              const retired = e.status === 'RETIRED';
              return (
                <tr key={e.equipmentId}>
                  <td>{isEditing ? <input aria-label="Name" value={editing.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} /> : e.name}</td>
                  <td>{isEditing ? <input aria-label="Location" value={editing.location} onChange={(ev) => setEditing({ ...editing, location: ev.target.value })} /> : e.location}</td>
                  <td>
                    <StatusBadge status={e.status} />
                    {e.status === 'LOCKED' && <div className="hint small">{e.activeLocks.length} active lock(s): cannot be retired until released</div>}
                  </td>
                  <td className="actions">
                    {retired ? <span className="muted">No actions</span> : isEditing ? (
                      <>
                        <button className="btn btn-primary" onClick={() => act(() => api.admin.updateEquipment(e.equipmentId, { name: editing.name, location: editing.location }), `${editing.name} updated.`)}>Save</button>
                        <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : confirming === e.equipmentId ? (
                      <>
                        <span>Retire {e.name}?</span>
                        <button className="btn btn-danger" onClick={() => act(() => api.admin.retireEquipment(e.equipmentId), `${e.name} retired.`)}>Confirm retire</button>
                        <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn" onClick={() => setEditing({ id: e.equipmentId, name: e.name, location: e.location })}>Edit</button>
                        <button className="btn btn-danger-outline" onClick={() => { setNotice(null); setConfirming(e.equipmentId); }}>Retire</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AuthorizationsTab() {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [auths, setAuths] = useState(new Set());
  const [setNotice, notice] = useNotice();

  const load = useCallback(async () => {
    try {
      const [u, e, a] = await Promise.all([api.admin.users(), api.admin.equipment(), api.admin.authorizations()]);
      setUsers(u.users.filter((x) => x.role !== 'ADMIN'));
      setItems(e.equipment.filter((x) => x.status !== 'RETIRED'));
      setAuths(new Set(a.authorizations.map((x) => `${x.userId}:${x.equipmentId}`)));
    } catch (err) { setNotice({ kind: 'error', text: err.message }); }
  }, [setNotice]);
  useEffect(() => { load(); }, [load]);

  async function toggle(u, e, on) {
    try {
      await (on ? api.admin.grant(u.userId, e.equipmentId) : api.admin.revoke(u.userId, e.equipmentId));
      setNotice({ kind: 'ok', text: `${on ? 'Granted' : 'Revoked'}: ${u.fullName} / ${e.name}.` });
    } catch (err) { setNotice({ kind: 'error', text: err.message }); }
    load();
  }

  return (
    <>
      {notice}
      <p className="muted">Workers may only apply or release locks on equipment ticked here. Revoking does not remove locks they already hold; a supervisor can override those.</p>
      <div className="card table-wrap">
        <table className="matrix">
          <thead><tr><th>Worker</th>{items.map((e) => <th key={e.equipmentId}>{e.name}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId}>
                <th scope="row">{u.fullName}{!u.isActive && <span className="muted small"> (deactivated)</span>}</th>
                {items.map((e) => (
                  <td key={e.equipmentId} className="center">
                    <input type="checkbox" aria-label={`${u.fullName} authorized for ${e.name}`} checked={auths.has(`${u.userId}:${e.equipmentId}`)} onChange={(ev) => toggle(u, e, ev.target.checked)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('users');
  const tabs = [['users', 'Users'], ['equipment', 'Equipment'], ['authorizations', 'Authorizations']];
  return (
    <main className="page" id="main">
      <h1>Administration</h1>
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`} className={`tab ${tab === key ? 'tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'users' && <UsersTab />}
        {tab === 'equipment' && <EquipmentTab />}
        {tab === 'authorizations' && <AuthorizationsTab />}
      </div>
    </main>
  );
}
