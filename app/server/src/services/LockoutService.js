// LockoutService: the real, unit-tested class from loto-unit-test is reused unchanged.
// This thin subclass only adds the read model (getEquipmentStatuses, from the class diagram)
// and the one-lock-per-worker-per-equipment rule that the UI relies on.
const { LockoutService: CoreLockoutService, STATUS } = require('../../../../loto-unit-test/src/lockoutService');
const { ValidationError, NotFoundError } = require('../errors');

class LockoutService extends CoreLockoutService {
  applyLock(workerId, equipmentId) {
    if (this.getActiveLocks(equipmentId).some((l) => l.workerId === workerId)) {
      throw new ValidationError('You already hold a lock on this equipment');
    }
    return super.applyLock(workerId, equipmentId);
  }

  #view(eq) {
    return {
      equipmentId: eq.equipmentId,
      name: eq.name,
      location: eq.location,
      status: eq.status,
      activeLocks: this.getActiveLocks(eq.equipmentId)
        .sort((a, b) => a.lockId - b.lockId)
        .map((l) => ({
          lockId: l.lockId,
          workerId: l.workerId,
          workerName: this.store.users.get(l.workerId)?.fullName ?? `User ${l.workerId}`,
          appliedAt: l.appliedAt,
        })),
    };
  }

  getEquipmentStatuses({ includeRetired = false } = {}) {
    return [...this.store.equipment.values()]
      .filter((e) => includeRetired || e.status !== STATUS.RETIRED)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => this.#view(e));
  }

  getEquipmentDetail(equipmentId) {
    const eq = this.store.equipment.get(equipmentId);
    if (!eq) throw new NotFoundError(`Equipment ${equipmentId} not found`);
    return this.#view(eq);
  }
}

module.exports = { LockoutService, STATUS };
