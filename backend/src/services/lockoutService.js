const { AppError } = require('../errors');

// Application-layer control class from the class diagram (Section 5.2).
class LockoutService {
  constructor(repo, audit) { this.repo = repo; this.audit = audit; }

  _requireUser(userId) {
    const user = this.repo.getUser(userId);
    if (!user || !user.active) throw new AppError(401, 'UNAUTHENTICATED', 'Unknown or inactive user');
    return user;
  }

  // FR-3, FR-4: apply a lock
  applyLock(userId, equipmentId) {
    const user = this._requireUser(userId);
    const equipment = this.repo.getEquipment(equipmentId);
    if (!equipment || equipment.retired) throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipment not found');

    if (!this.repo.isAuthorized(user.id, equipmentId)) {
      this.audit.log('LOCK_DENIED', user.id, equipmentId, { reason: 'not authorized for equipment' });
      throw new AppError(403, 'NOT_AUTHORIZED', 'You are not authorized for this equipment');
    }
    const already = this.repo.getActiveLocks(equipmentId).find(l => l.workerId === user.id);
    if (already) throw new AppError(409, 'ALREADY_LOCKED_BY_YOU', 'You already have an active lock on this equipment');

    const lock = this.repo.createLock({ workerId: user.id, equipmentId, appliedAt: new Date().toISOString() });
    this.repo.setEquipmentStatus(equipmentId, 'LOCKED');
    this.audit.log('LOCK_APPLIED', user.id, equipmentId, { lockId: lock.id });
    return lock;
  }

  // FR-5, FR-6: only the owner may release; equipment stays LOCKED until every lock is released
  releaseLock(userId, lockId) {
    const user = this._requireUser(userId);
    const lock = this._requireActiveLock(lockId);

    if (lock.workerId !== user.id) {
      this.audit.log('RELEASE_DENIED', user.id, lock.equipmentId, { lockId, owner: lock.workerId });
      throw new AppError(403, 'NOT_LOCK_OWNER', 'Only the worker who applied a lock can release it');
    }
    return this._release(lock, user.id, 'LOCK_RELEASED', null);
  }

  // FR-7: supervisor override requires a written reason
  overrideRelease(userId, lockId, reason) {
    const user = this._requireUser(userId);
    if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN') {
      this.audit.log('RELEASE_DENIED', user.id, null, { lockId, reason: 'override requires supervisor' });
      throw new AppError(403, 'NOT_SUPERVISOR', 'Only supervisors can override-release a lock');
    }
    if (!reason || !String(reason).trim()) throw new AppError(400, 'REASON_REQUIRED', 'A written reason is required');
    const lock = this._requireActiveLock(lockId);
    return this._release(lock, user.id, 'LOCK_OVERRIDE_RELEASED', String(reason).trim());
  }

  _requireActiveLock(lockId) {
    const lock = this.repo.getLock(lockId);
    if (!lock) throw new AppError(404, 'LOCK_NOT_FOUND', 'Lock not found');
    if (lock.status !== 'ACTIVE') throw new AppError(409, 'LOCK_ALREADY_RELEASED', 'Lock is already released');
    return lock;
  }

  _release(lock, byUserId, action, reason) {
    lock.status = 'RELEASED';
    lock.releasedAt = new Date().toISOString();
    lock.releasedBy = byUserId;
    lock.overrideReason = reason;
    if (this.repo.getActiveLocks(lock.equipmentId).length === 0) {
      this.repo.setEquipmentStatus(lock.equipmentId, 'UNLOCKED');
    }
    this.audit.log(action, byUserId, lock.equipmentId, { lockId: lock.id, reason });
    return lock;
  }

  // FR-9 + fail-safe NFR: status is derived from active locks, never "Unlocked" while a lock exists
  getEquipmentStatus(equipmentId) {
    const equipment = this.repo.getEquipment(equipmentId);
    if (!equipment) throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipment not found');
    const active = this.repo.getActiveLocks(equipmentId);
    return {
      equipmentId, name: equipment.name,
      status: active.length > 0 ? 'LOCKED' : 'UNLOCKED',
      activeLocks: active.map(l => ({ lockId: l.id, workerId: l.workerId, appliedAt: l.appliedAt })),
    };
  }

  getLock(lockId) {
    const lock = this.repo.getLock(lockId);
    if (!lock) throw new AppError(404, 'LOCK_NOT_FOUND', 'Lock not found');
    return lock;
  }

  listLocks({ equipmentId, status } = {}) {
    return this.repo.listLocks().filter(l =>
      (!equipmentId || l.equipmentId === equipmentId) && (!status || l.status === status));
  }
}
module.exports = { LockoutService };
