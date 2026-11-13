// The only place the client talks to the server: the REST API under /api.
const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function send(path, { method = 'GET', body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server', 0);
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) onUnauthorized();
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

const qs = (filters) => {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (username, password) => send('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => send('/auth/logout', { method: 'POST' }),
  me: () => send('/auth/me'),
  equipment: () => send('/equipment'),
  equipmentDetail: (id) => send(`/equipment/${id}`),
  applyLock: (equipmentId) => send(`/equipment/${equipmentId}/locks`, { method: 'POST' }),
  releaseLock: (lockId) => send(`/locks/${lockId}/release`, { method: 'POST' }),
  override: (lockId, reason) => send(`/locks/${lockId}/override`, { method: 'POST', body: { reason } }),
  notifications: () => send('/notifications'),
  markRead: (id) => send(`/notifications/${id}/read`, { method: 'POST' }),
  audit: (filters) => send(`/audit${qs(filters)}`),
  auditActors: () => send('/audit/actors'),
  auditVerify: () => send('/audit/verify'),
  auditExport: async (filters) => {
    const res = await send(`/audit/export${qs(filters)}`, { raw: true });
    return { blob: await res.blob(), count: Number(res.headers.get('X-Row-Count')) };
  },
  admin: {
    users: () => send('/admin/users'),
    createUser: (data) => send('/admin/users', { method: 'POST', body: data }),
    updateUser: (id, data) => send(`/admin/users/${id}`, { method: 'PATCH', body: data }),
    deactivateUser: (id) => send(`/admin/users/${id}/deactivate`, { method: 'POST' }),
    equipment: () => send('/admin/equipment'),
    addEquipment: (data) => send('/admin/equipment', { method: 'POST', body: data }),
    updateEquipment: (id, data) => send(`/admin/equipment/${id}`, { method: 'PATCH', body: data }),
    retireEquipment: (id) => send(`/admin/equipment/${id}/retire`, { method: 'POST' }),
    authorizations: () => send('/admin/authorizations'),
    grant: (userId, equipmentId) => send('/admin/authorizations', { method: 'POST', body: { userId, equipmentId } }),
    revoke: (userId, equipmentId) => send(`/admin/authorizations/${userId}/${equipmentId}`, { method: 'DELETE' }),
  },
};
