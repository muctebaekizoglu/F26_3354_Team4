// Demo seed data: 6 users, 6 pieces of equipment, authorizations and a short audit history.
// History is created through the real services (with a temporary clock) so the audit hash chain is genuine.
const bcrypt = require('bcryptjs');
const { authKey } = require('./store');

// Demo passwords only (listed in the README). Never reuse them anywhere real.
const DEMO_USERS = [
  { username: 'amorales', fullName: 'Ana Morales', role: 'WORKER', password: 'Worker#2026' },
  { username: 'bchen', fullName: 'Ben Chen', role: 'WORKER', password: 'Worker#2026' },
  { username: 'cdavis', fullName: 'Carla Davis', role: 'WORKER', password: 'Worker#2026' },
  { username: 'dlee', fullName: 'Dan Lee', role: 'WORKER', password: 'Worker#2026', isActive: false },
  { username: 'esingh', fullName: 'Eva Singh', role: 'SUPERVISOR', password: 'Supervisor#2026' },
  { username: 'admin', fullName: 'Frank Admin', role: 'ADMIN', password: 'Admin#2026' },
];

const EQUIPMENT = [
  { name: 'Hydraulic Press #1', location: 'Building A - Press Shop' },
  { name: 'Conveyor Belt A', location: 'Building A - Line 2' },
  { name: 'Mixer 1', location: 'Building B - Mixing Room' },
  { name: 'Boiler Pump', location: 'Utility Plant' },
  { name: 'Lathe 4', location: 'Machine Shop' },
  { name: 'Air Compressor', location: 'Utility Plant' },
];

// username -> equipment names the user is authorized for (Ana: not Lathe 4 / Air Compressor; Carla: not Conveyor Belt A / Lathe 4)
const AUTHORIZATIONS = {
  amorales: ['Hydraulic Press #1', 'Conveyor Belt A', 'Mixer 1', 'Boiler Pump'],
  bchen: ['Conveyor Belt A', 'Mixer 1', 'Lathe 4', 'Air Compressor'],
  cdavis: ['Hydraulic Press #1', 'Mixer 1', 'Boiler Pump', 'Air Compressor'],
  dlee: ['Hydraulic Press #1', 'Conveyor Belt A'],
  esingh: EQUIPMENT.map((e) => e.name),
};

const hashCache = new Map();
function hashOnce(password) {
  if (!hashCache.has(password)) hashCache.set(password, bcrypt.hashSync(password, 10));
  return hashCache.get(password);
}

function seed({ store, auditService, lockoutService, notificationService }) {
  const now = new Date();
  const user = {};
  for (const u of DEMO_USERS) {
    const rec = {
      userId: store.nextId('user'), username: u.username, fullName: u.fullName, role: u.role,
      passwordHash: hashOnce(u.password), isActive: u.isActive !== false, failedLoginCount: 0, lockedUntil: null,
    };
    store.users.set(rec.userId, rec);
    user[u.username] = rec.userId;
  }
  const eq = {};
  for (const e of EQUIPMENT) {
    const rec = { equipmentId: store.nextId('equipment'), name: e.name, location: e.location, status: 'UNLOCKED' };
    store.equipment.set(rec.equipmentId, rec);
    eq[e.name] = rec.equipmentId;
  }
  for (const [username, names] of Object.entries(AUTHORIZATIONS)) {
    for (const n of names) {
      store.authorizations.set(authKey(user[username], eq[n]), { userId: user[username], equipmentId: eq[n], grantedAt: new Date(now.getTime() - 30 * 86400000) });
    }
  }

  // Past activity, oldest first, stamped with a temporary clock.
  const services = [auditService, lockoutService, notificationService];
  const originals = services.map((s) => s.clock);
  let t = now;
  services.forEach((s) => { s.clock = () => t; });
  const at = (daysAgo, hh, mm) => {
    t = new Date(now.getTime() - daysAgo * 86400000);
    t.setUTCHours(hh, mm, 0, 0);
  };
  const attempt = (fn) => { try { fn(); } catch (err) { /* denial is the expected outcome and is audited */ } };

  at(6, 7, 58); auditService.log(user.amorales, 'LOGIN_SUCCESS', null, '');
  at(6, 8, 2); const l1 = lockoutService.applyLock(user.amorales, eq['Hydraulic Press #1']);
  at(6, 10, 15); lockoutService.releaseLock(user.amorales, l1.lockId);

  at(5, 8, 10); auditService.log(user.bchen, 'LOGIN_SUCCESS', null, '');
  at(5, 8, 15); const l2 = lockoutService.applyLock(user.bchen, eq['Mixer 1']);
  at(5, 8, 20); const l3 = lockoutService.applyLock(user.cdavis, eq['Mixer 1']);
  at(5, 9, 40); lockoutService.releaseLock(user.bchen, l2.lockId);
  at(5, 9, 50); lockoutService.releaseLock(user.cdavis, l3.lockId);

  at(4, 13, 5); attempt(() => lockoutService.applyLock(user.amorales, eq['Lathe 4'])); // LOCK_DENIED

  at(3, 7, 45); const l4 = lockoutService.applyLock(user.cdavis, eq['Air Compressor']);
  at(3, 9, 0); auditService.log(user.amorales, 'LOGIN_FAILED', null, 'bad password');
  at(3, 16, 30); lockoutService.overrideRelease(user.esingh, l4.lockId, 'Shift ended; worker left site, area verified safe');

  at(2, 8, 0); const l5 = lockoutService.applyLock(user.amorales, eq['Conveyor Belt A']);
  at(2, 8, 30); attempt(() => lockoutService.releaseLock(user.cdavis, l5.lockId)); // RELEASE_DENIED
  at(2, 11, 0); lockoutService.releaseLock(user.amorales, l5.lockId);

  services.forEach((s, i) => { s.clock = originals[i]; });
  store.notifications.clear(); // history should not show up as fresh banners
}

module.exports = { seed, DEMO_USERS };
