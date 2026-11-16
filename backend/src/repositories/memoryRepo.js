// Data-layer stand-in. Abrar's real database replaces this file; keep the same method names
// and the services/routes do not need to change.
class MemoryRepo {
  constructor() { this.reset(); }

  reset() {
    this.users = new Map();
    this.equipment = new Map();
    this.authorizations = new Set(); // "userId:equipmentId"
    this.locks = new Map();
    this.audit = [];
    this.nextLockId = 1;
  }

  seedDemoData() {
    this.reset();
    this.addUser({ id: 'w1', name: 'Alice Worker', role: 'WORKER', active: true });
    this.addUser({ id: 'w2', name: 'Bob Worker', role: 'WORKER', active: true });
    this.addUser({ id: 's1', name: 'Sam Supervisor', role: 'SUPERVISOR', active: true });
    this.addEquipment({ id: 'e1', name: 'Conveyor Belt A', location: 'Line 1' });
    this.addEquipment({ id: 'e2', name: 'Press Machine', location: 'Line 2' });
    this.authorize('w1', 'e1'); this.authorize('w2', 'e1'); this.authorize('w1', 'e2');
    this.authorize('s1', 'e1'); this.authorize('s1', 'e2');
  }

  addUser(u) { this.users.set(u.id, { ...u }); }
  getUser(id) { return this.users.get(id) || null; }

  addEquipment(e) { this.equipment.set(e.id, { status: 'UNLOCKED', retired: false, ...e }); }
  getEquipment(id) { return this.equipment.get(id) || null; }
  listEquipment() { return [...this.equipment.values()].filter(e => !e.retired); }
  setEquipmentStatus(id, status) { this.equipment.get(id).status = status; }

  authorize(userId, equipmentId) { this.authorizations.add(`${userId}:${equipmentId}`); }
  isAuthorized(userId, equipmentId) { return this.authorizations.has(`${userId}:${equipmentId}`); }

  createLock({ workerId, equipmentId, appliedAt }) {
    const lock = {
      id: `L${this.nextLockId++}`, workerId, equipmentId, appliedAt,
      releasedAt: null, releasedBy: null, overrideReason: null, status: 'ACTIVE',
    };
    this.locks.set(lock.id, lock);
    return lock;
  }
  getLock(id) { return this.locks.get(id) || null; }
  listLocks() { return [...this.locks.values()]; }
  getActiveLocks(equipmentId) {
    return this.listLocks().filter(l => l.equipmentId === equipmentId && l.status === 'ACTIVE');
  }

  appendAudit(entry) { this.audit.push(entry); return entry; }
  getAudit() { return this.audit; }
  lastAuditHash() { return this.audit.length ? this.audit[this.audit.length - 1].hash : 'GENESIS'; }
}
module.exports = { MemoryRepo };
