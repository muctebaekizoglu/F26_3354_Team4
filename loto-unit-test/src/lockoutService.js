// LockoutService - Application layer of the LOTO Management System (SDD Section 5.2).
// Implements FR-3 (authorization), FR-4 (apply lock), FR-5 (owner-only release),
// FR-6 (group lockout), FR-7 (supervisor override with reason) and the
// Reliability NFR (lock, status change and audit entry succeed or fail together).
const { AuthorizationError, ValidationError, NotFoundError } = require('./errors');

const STATUS = Object.freeze({ LOCKED: 'LOCKED', UNLOCKED: 'UNLOCKED', RETIRED: 'RETIRED' });

class LockoutService {
  /**
   * @param {object} deps
   * @param {object} deps.store  data layer: { equipment: Map, locks: Map, nextLockId() }
   * @param {object} deps.authService  { authorize(userId, equipmentId, action) -> boolean }
   * @param {object} deps.auditService  { log(actorId, action, equipmentId, details) }
   * @param {object} deps.notificationService  { notifyStatusChange(equipment) }
   * @param {function} [deps.clock]  returns the current Date (injectable for tests)
   */
  constructor({ store, authService, auditService, notificationService, clock = () => new Date() }) {
    this.store = store;
    this.auth = authService;
    this.audit = auditService;
    this.notify = notificationService;
    this.clock = clock;
  }

  getActiveLocks(equipmentId) {
    return [...this.store.locks.values()].filter(l => l.equipmentId === equipmentId && l.isActive);
  }

  #getEquipment(equipmentId) {
    const eq = this.store.equipment.get(equipmentId);
    if (!eq) throw new NotFoundError(`Equipment ${equipmentId} not found`);
    return eq;
  }

  #getLock(lockId) {
    const lock = this.store.locks.get(lockId);
    if (!lock) throw new NotFoundError(`Lock ${lockId} not found`);
    return lock;
  }

  // Runs fn as one unit of work: if any step throws, the store is restored (Reliability NFR).
  #transaction(fn) {
    const snapshot = {
      equipment: new Map([...this.store.equipment].map(([k, v]) => [k, { ...v }])),
      locks: new Map([...this.store.locks].map(([k, v]) => [k, { ...v }])),
    };
    try {
      return fn();
    } catch (err) {
      this.store.equipment = snapshot.equipment;
      this.store.locks = snapshot.locks;
      throw err;
    }
  }

  // Sets status from the active locks: LOCKED while any lock is active (FR-6, Safety NFR).
  #refreshStatus(equipmentId) {
    const eq = this.#getEquipment(equipmentId);
    const before = eq.status;
    eq.status = this.getActiveLocks(equipmentId).length > 0 ? STATUS.LOCKED : STATUS.UNLOCKED;
    return before !== eq.status;
  }

  /** FR-3, FR-4: an authorized worker applies a personal lock. */
  applyLock(workerId, equipmentId) {
    const eq = this.#getEquipment(equipmentId);
    if (eq.status === STATUS.RETIRED) throw new ValidationError('Equipment is retired');
    if (!this.auth.authorize(workerId, equipmentId, 'APPLY')) {
      this.audit.log(workerId, 'LOCK_DENIED', equipmentId, 'Not authorized for equipment');
      throw new AuthorizationError('Not authorized for this equipment');
    }
    const lock = this.#transaction(() => {
      const newLock = {
        lockId: this.store.nextLockId(),
        workerId,
        equipmentId,
        appliedAt: this.clock(),
        releasedAt: null,
        isActive: true,
        overrideReason: null,
      };
      this.store.locks.set(newLock.lockId, newLock);
      this.#refreshStatus(equipmentId);
      this.audit.log(workerId, 'LOCK_APPLIED', equipmentId, `lockId=${newLock.lockId}`);
      return newLock;
    });
    this.notify.notifyStatusChange(this.#getEquipment(equipmentId));
    return { ...lock };
  }

  /** FR-5, FR-6: only the worker who applied a lock may release it. */
  releaseLock(workerId, lockId) {
    const lock = this.#getLock(lockId);
    if (!lock.isActive) throw new ValidationError('Lock is already released');
    if (lock.workerId !== workerId || !this.auth.authorize(workerId, lock.equipmentId, 'RELEASE')) {
      this.audit.log(workerId, 'RELEASE_DENIED', lock.equipmentId, `lockId=${lockId}`);
      throw new AuthorizationError('Only the worker who applied this lock can remove it');
    }
    return this.#release(lock, workerId, 'LOCK_RELEASED', null);
  }

  /** FR-7: a supervisor releases an abandoned lock with a mandatory written reason. */
  overrideRelease(supervisorId, lockId, reason) {
    const lock = this.#getLock(lockId);
    if (!lock.isActive) throw new ValidationError('Lock is already released');
    if (!this.auth.authorize(supervisorId, lock.equipmentId, 'OVERRIDE')) {
      this.audit.log(supervisorId, 'OVERRIDE_DENIED', lock.equipmentId, `lockId=${lockId}`);
      throw new AuthorizationError('Only a supervisor can override a lock');
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new ValidationError('A written reason is required for an override');
    }
    return this.#release(lock, supervisorId, 'LOCK_OVERRIDDEN', reason.trim());
  }

  #release(lock, actorId, action, reason) {
    let statusChanged = false;
    const result = this.#transaction(() => {
      const stored = this.store.locks.get(lock.lockId);
      stored.isActive = false;
      stored.releasedAt = this.clock();
      stored.overrideReason = reason;
      statusChanged = this.#refreshStatus(stored.equipmentId);
      this.audit.log(actorId, action, stored.equipmentId,
        reason ? `lockId=${stored.lockId}; reason=${reason}` : `lockId=${stored.lockId}`);
      return { ...stored };
    });
    if (statusChanged) this.notify.notifyStatusChange(this.#getEquipment(result.equipmentId));
    return { lock: result, equipmentStatus: this.#getEquipment(result.equipmentId).status };
  }
}

module.exports = { LockoutService, STATUS };
