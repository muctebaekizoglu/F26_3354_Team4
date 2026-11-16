// API tests (Jest + supertest) against a freshly seeded in-memory app for every test.
const request = require('supertest');
const { createApp } = require('../src/app');
const { computeHash } = require('../src/services/AuditService');

const PW = { worker: 'Worker#2026', supervisor: 'Supervisor#2026', admin: 'Admin#2026' };
let ctx;
let equipmentIds;

beforeEach(() => {
  ctx = createApp({ secret: 'test-secret' });
  equipmentIds = Object.fromEntries([...ctx.store.equipment.values()].map((e) => [e.name, e.equipmentId]));
});

async function loginAs(username, password) {
  const agent = request.agent(ctx.app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  return { agent, res };
}
const asWorker = async (u = 'amorales') => (await loginAs(u, PW.worker)).agent;
const asSupervisor = async () => (await loginAs('esingh', PW.supervisor)).agent;
const asAdmin = async () => (await loginAs('admin', PW.admin)).agent;

describe('authentication (FR-1, FR-2, FR-13)', () => {
  test('login success returns the user and sets an HTTP-only cookie', async () => {
    const { res } = await loginAs('amorales', PW.worker);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'amorales', role: 'WORKER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  test('wrong password and unknown user give the same generic message', async () => {
    const bad = await request(ctx.app).post('/api/auth/login').send({ username: 'amorales', password: 'nope' });
    const unknown = await request(ctx.app).post('/api/auth/login').send({ username: 'ghost', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe('Invalid username or password');
    expect(unknown.body.error).toBe('Invalid username or password');
  });

  test('account locks after 5 consecutive failures; the 6th attempt fails even with the right password', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await request(ctx.app).post('/api/auth/login').send({ username: 'bchen', password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const sixth = await request(ctx.app).post('/api/auth/login').send({ username: 'bchen', password: PW.worker });
    expect(sixth.status).toBe(423);
    expect(sixth.body.error).toMatch(/locked/i);
  });

  test('lockout ends after 15 minutes', async () => {
    let now = new Date('2027-01-11T08:00:00Z');
    ctx = createApp({ secret: 's', clock: () => now });
    for (let i = 0; i < 5; i += 1) await request(ctx.app).post('/api/auth/login').send({ username: 'bchen', password: 'wrong' });
    now = new Date(now.getTime() + 16 * 60000);
    const res = await request(ctx.app).post('/api/auth/login').send({ username: 'bchen', password: PW.worker });
    expect(res.status).toBe(200);
  });

  test('deactivated user cannot log in', async () => {
    const { res } = await loginAs('dlee', PW.worker);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid username or password');
  });

  test('session expires after 30 minutes of inactivity', async () => {
    let now = new Date('2027-01-11T08:00:00Z');
    ctx = createApp({ secret: 's', clock: () => now });
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/login').send({ username: 'amorales', password: PW.worker });
    now = new Date(now.getTime() + 29 * 60000);
    expect((await agent.get('/api/auth/me')).status).toBe(200); // activity slides the window
    now = new Date(now.getTime() + 31 * 60000);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  test('passwords are stored as bcrypt hashes with cost >= 10', () => {
    for (const u of ctx.store.users.values()) {
      expect(u.passwordHash).toMatch(/^\$2[aby]\$(\d\d)\$/);
      expect(Number(u.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
    }
  });

  test('requests without a session get 401 JSON', async () => {
    const res = await request(ctx.app).get('/api/equipment');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

describe('locks (FR-3 to FR-7)', () => {
  test('unauthorized apply is refused with 403 and audited as LOCK_DENIED', async () => {
    const agent = await asWorker('amorales'); // not authorized for Lathe 4
    const res = await agent.post(`/api/equipment/${equipmentIds['Lathe 4']}/locks`);
    expect(res.status).toBe(403);
    expect(ctx.store.equipment.get(equipmentIds['Lathe 4']).status).toBe('UNLOCKED');
    const denied = ctx.services.auditService.query({ action: 'LOCK_DENIED' });
    expect(denied.some((e) => e.equipmentId === equipmentIds['Lathe 4'])).toBe(true);
  });

  test('a worker who is not the owner cannot release a lock (403)', async () => {
    const ana = await asWorker('amorales');
    const ben = await asWorker('bchen');
    const apply = await ana.post(`/api/equipment/${equipmentIds['Conveyor Belt A']}/locks`);
    expect(apply.status).toBe(201);
    const res = await ben.post(`/api/locks/${apply.body.lock.lockId}/release`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the worker who applied/);
    const detail = await ana.get(`/api/equipment/${equipmentIds['Conveyor Belt A']}`);
    expect(detail.body.equipment.status).toBe('LOCKED');
  });

  test('group lockout: equipment stays LOCKED until every lock is released', async () => {
    const ana = await asWorker('amorales');
    const ben = await asWorker('bchen');
    const id = equipmentIds['Conveyor Belt A'];
    const a = await ana.post(`/api/equipment/${id}/locks`);
    const b = await ben.post(`/api/equipment/${id}/locks`);
    expect((await ana.get(`/api/equipment/${id}`)).body.equipment.activeLocks).toHaveLength(2);

    const r1 = await ana.post(`/api/locks/${a.body.lock.lockId}/release`);
    expect(r1.body.equipmentStatus).toBe('LOCKED');
    const list = await ana.get('/api/equipment');
    expect(list.body.equipment.find((e) => e.equipmentId === id)).toMatchObject({ status: 'LOCKED' });

    const r2 = await ben.post(`/api/locks/${b.body.lock.lockId}/release`);
    expect(r2.body.equipmentStatus).toBe('UNLOCKED');
  });

  test('a worker cannot hold two locks on the same equipment', async () => {
    const ana = await asWorker('amorales');
    const id = equipmentIds['Mixer 1'];
    await ana.post(`/api/equipment/${id}/locks`);
    const again = await ana.post(`/api/equipment/${id}/locks`);
    expect(again.status).toBe(400);
  });

  test('override with a blank reason is rejected (400) and the lock stays', async () => {
    const ana = await asWorker('amorales');
    const sup = await asSupervisor();
    const lock = (await ana.post(`/api/equipment/${equipmentIds['Boiler Pump']}/locks`)).body.lock;
    for (const reason of ['', '   ', undefined]) {
      const res = await sup.post(`/api/locks/${lock.lockId}/override`).send({ reason });
      expect(res.status).toBe(400);
    }
    expect(ctx.store.locks.get(lock.lockId).isActive).toBe(true);
  });

  test('supervisor override with a reason releases the lock; a worker cannot override (403)', async () => {
    const ana = await asWorker('amorales');
    const sup = await asSupervisor();
    const lock = (await ana.post(`/api/equipment/${equipmentIds['Boiler Pump']}/locks`)).body.lock;
    const denied = await (await asWorker('bchen')).post(`/api/locks/${lock.lockId}/override`).send({ reason: 'because' });
    expect(denied.status).toBe(403);
    const ok = await sup.post(`/api/locks/${lock.lockId}/override`).send({ reason: 'Worker left site; area verified safe' });
    expect(ok.status).toBe(200);
    expect(ok.body.equipmentStatus).toBe('UNLOCKED');
    expect(ok.body.lock.overrideReason).toBe('Worker left site; area verified safe');
  });

  test('unknown lock id gives 404', async () => {
    const res = await (await asSupervisor()).post('/api/locks/9999/override').send({ reason: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('admin (FR-13, FR-14)', () => {
  test('retiring equipment with an active lock is refused with a clear error', async () => {
    const ana = await asWorker('amorales');
    const admin = await asAdmin();
    const id = equipmentIds['Conveyor Belt A'];
    await ana.post(`/api/equipment/${id}/locks`);
    const res = await admin.post(`/api/admin/equipment/${id}/retire`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/active lock/);
    expect(ctx.store.equipment.get(id).status).toBe('LOCKED');
  });

  test('retiring idle equipment works and it disappears from the dashboard list', async () => {
    const admin = await asAdmin();
    const id = equipmentIds['Lathe 4'];
    expect((await admin.post(`/api/admin/equipment/${id}/retire`)).status).toBe(200);
    const list = await admin.get('/api/equipment');
    expect(list.body.equipment.find((e) => e.equipmentId === id)).toBeUndefined();
  });

  test('admin endpoints are forbidden for non-admins', async () => {
    expect((await (await asWorker()).get('/api/admin/users')).status).toBe(403);
    expect((await (await asSupervisor()).post('/api/admin/users').send({})).status).toBe(403);
  });

  test('create user (temporary password), change role, deactivate', async () => {
    const admin = await asAdmin();
    const created = await admin.post('/api/admin/users').send({ username: 'newbie', fullName: 'New Bie', role: 'WORKER' });
    expect(created.status).toBe(201);
    expect(created.body.user.tempPassword).toHaveLength(12);
    const id = created.body.user.userId;
    expect((await loginAs('newbie', created.body.user.tempPassword)).res.status).toBe(200);
    const upd = await admin.patch(`/api/admin/users/${id}`).send({ role: 'SUPERVISOR' });
    expect(upd.body.user.role).toBe('SUPERVISOR');
    expect((await admin.post(`/api/admin/users/${id}/deactivate`)).status).toBe(200);
    expect((await loginAs('newbie', created.body.user.tempPassword)).res.status).toBe(401);
  });

  test('grant and revoke authorizations change what a worker may lock', async () => {
    const admin = await asAdmin();
    const ben = await asWorker('bchen');
    const id = equipmentIds['Hydraulic Press #1'];
    expect((await ben.post(`/api/equipment/${id}/locks`)).status).toBe(403);
    const ben_id = [...ctx.store.users.values()].find((u) => u.username === 'bchen').userId;
    await admin.post('/api/admin/authorizations').send({ userId: ben_id, equipmentId: id });
    expect((await ben.post(`/api/equipment/${id}/locks`)).status).toBe(201);
  });
});

describe('audit and reports (FR-8, FR-11, FR-12)', () => {
  test('audit entries form a valid SHA-256 hash chain, and tampering is detected', async () => {
    const ana = await asWorker('amorales');
    await ana.post(`/api/equipment/${equipmentIds['Mixer 1']}/locks`);
    const entries = [...ctx.store.audit.values()];
    expect(entries.length).toBeGreaterThan(10);
    entries.forEach((e, i) => {
      expect(e.prevHash).toBe(i === 0 ? '0'.repeat(64) : entries[i - 1].hash);
      expect(e.hash).toBe(computeHash(e));
    });
    expect(ctx.services.auditService.verifyChain().valid).toBe(true);

    const victim = entries[3];
    ctx.store.audit.set(victim.entryId, { ...victim, details: 'edited' });
    expect(ctx.services.auditService.verifyChain()).toMatchObject({ valid: false, brokenAt: victim.entryId });
  });

  test('there are no routes to update or delete audit entries', async () => {
    const sup = await asSupervisor();
    for (const method of ['put', 'patch', 'delete', 'post']) {
      const res = await sup[method]('/api/audit/1').send({});
      expect(res.status).toBe(404);
    }
  });

  test('login success and failure are audited', async () => {
    await request(ctx.app).post('/api/auth/login').send({ username: 'amorales', password: 'bad' });
    await loginAs('amorales', PW.worker);
    const sup = await asSupervisor();
    const failed = await sup.get('/api/audit?action=LOGIN_FAILED');
    const ok = await sup.get('/api/audit?action=LOGIN_SUCCESS');
    expect(failed.body.count).toBeGreaterThanOrEqual(2);
    expect(ok.body.count).toBeGreaterThanOrEqual(2);
  });

  test('filters narrow results by equipment, worker, action and date', async () => {
    const sup = await asSupervisor();
    const id = equipmentIds['Mixer 1'];
    const byEq = await sup.get(`/api/audit?equipmentId=${id}`);
    expect(byEq.body.entries.length).toBeGreaterThan(0);
    expect(byEq.body.entries.every((e) => e.equipmentId === id)).toBe(true);
    const future = await sup.get('/api/audit?from=2999-01-01');
    expect(future.body.count).toBe(0);
    const overridden = await sup.get('/api/audit?action=LOCK_OVERRIDDEN');
    expect(overridden.body.entries[0].details).toMatch(/reason=/);
  });

  test('workers cannot read the audit log', async () => {
    expect((await (await asWorker()).get('/api/audit')).status).toBe(403);
  });

  test('CSV export row count equals the query result count, is RFC 4180 and is itself audited', async () => {
    const sup = await asSupervisor();
    const query = '?action=LOCK_APPLIED';
    const onScreen = await sup.get(`/api/audit${query}`);
    const res = await sup.get(`/api/audit/export${query}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\r\n');
    expect(lines.pop()).toBe(''); // trailing CRLF
    expect(lines[0]).toBe('Entry ID,Timestamp,Actor,Action,Equipment,Details,Hash');
    expect(lines.length - 1).toBe(onScreen.body.count);
    expect(Number(res.headers['x-row-count'])).toBe(onScreen.body.count);
    expect(ctx.services.auditService.query({ action: 'REPORT_EXPORTED' })).toHaveLength(1);
  });

  test('CSV quotes commas, quotes and newlines', () => {
    const { csvCell } = require('../src/services/ReportService');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('notifications (FR-10) and status', () => {
  test('locking notifies active users, and getUnread / markRead work', async () => {
    const ana = await asWorker('amorales');
    const ben = await asWorker('bchen');
    await ana.post(`/api/equipment/${equipmentIds['Conveyor Belt A']}/locks`);
    const res = await ben.get('/api/notifications');
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].message).toBe('Conveyor Belt A was LOCKED by Ana Morales');
    await ben.post(`/api/notifications/${res.body.notifications[0].notificationId}/read`);
    expect((await ben.get('/api/notifications')).body.notifications).toHaveLength(0);
    const dlee = [...ctx.store.notifications.values()].filter((n) => n.userId === 4);
    expect(dlee).toHaveLength(0); // deactivated users are not notified
  });

  test('malformed JSON gives a JSON 400', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
