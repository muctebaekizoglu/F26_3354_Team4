// Unit tests for LockoutService (Test Plan, Section 4). Run with: npm test
const { LockoutService, STATUS } = require('../src/lockoutService');
const { AuthorizationError, ValidationError } = require('../src/errors');

const FIXED_TIME = new Date('2027-01-11T08:00:00Z');

// Builds a fresh in-memory data layer and mocked collaborators for each test.
function setup({ authorized = () => true } = {}) {
  let id = 0;
  const store = {
    equipment: new Map([
      [1, { equipmentId: 1, name: 'Hydraulic Press #1', status: STATUS.UNLOCKED }],
      [2, { equipmentId: 2, name: 'Conveyor Belt A', status: STATUS.UNLOCKED }],
    ]),
    locks: new Map(),
    nextLockId: () => ++id,
  };
  const authService = { authorize: jest.fn(authorized) };
  const auditService = { log: jest.fn() };
  const notificationService = { notifyStatusChange: jest.fn() };
  const service = new LockoutService({
    store, authService, auditService, notificationService, clock: () => FIXED_TIME,
  });
  return { service, store, authService, auditService, notificationService };
}

describe('LockoutService', () => {
  test('TC-1 (FR-4): authorized worker applies a lock and equipment becomes LOCKED', () => {
    const { service, store, auditService, notificationService } = setup();
    const lock = service.applyLock(101, 1);

    expect(lock).toMatchObject({ lockId: 1, workerId: 101, equipmentId: 1, isActive: true });
    expect(lock.appliedAt).toEqual(FIXED_TIME);
    expect(store.equipment.get(1).status).toBe(STATUS.LOCKED);
    expect(auditService.log).toHaveBeenCalledWith(101, 'LOCK_APPLIED', 1, 'lockId=1');
    expect(notificationService.notifyStatusChange).toHaveBeenCalledTimes(1);
  });

  test('TC-2 (FR-3): unauthorized worker is refused, status unchanged, attempt logged', () => {
    const { service, store, auditService } = setup({ authorized: () => false });

    expect(() => service.applyLock(102, 1)).toThrow(AuthorizationError);
    expect(store.equipment.get(1).status).toBe(STATUS.UNLOCKED);
    expect(store.locks.size).toBe(0);
    expect(auditService.log).toHaveBeenCalledWith(102, 'LOCK_DENIED', 1, 'Not authorized for equipment');
  });

  test('TC-3 (FR-5): a different worker cannot release someone else\'s lock', () => {
    const { service, store, auditService } = setup();
    const lock = service.applyLock(101, 1);

    expect(() => service.releaseLock(102, lock.lockId)).toThrow(AuthorizationError);
    expect(store.locks.get(lock.lockId).isActive).toBe(true);
    expect(store.equipment.get(1).status).toBe(STATUS.LOCKED);
    expect(auditService.log).toHaveBeenCalledWith(102, 'RELEASE_DENIED', 1, 'lockId=1');
  });

  test('TC-4 (FR-6): group lockout stays LOCKED until the last lock is released', () => {
    const { service, store } = setup();
    const lockA = service.applyLock(101, 1);
    const lockB = service.applyLock(103, 1);

    const first = service.releaseLock(101, lockA.lockId);
    expect(first.equipmentStatus).toBe(STATUS.LOCKED);
    expect(service.getActiveLocks(1)).toHaveLength(1);

    const second = service.releaseLock(103, lockB.lockId);
    expect(second.equipmentStatus).toBe(STATUS.UNLOCKED);
    expect(store.equipment.get(1).status).toBe(STATUS.UNLOCKED);
  });

  test('TC-5 (FR-7): supervisor override with an empty reason is rejected', () => {
    const { service, store } = setup();
    const lock = service.applyLock(101, 1);

    expect(() => service.overrideRelease(201, lock.lockId, '   ')).toThrow(ValidationError);
    expect(store.locks.get(lock.lockId).isActive).toBe(true);
    expect(store.equipment.get(1).status).toBe(STATUS.LOCKED);
  });

  test('TC-6 (FR-7): supervisor override with a reason releases the lock and records it', () => {
    const { service, auditService } = setup();
    const lock = service.applyLock(101, 1);

    const result = service.overrideRelease(201, lock.lockId, 'Worker left site; area verified safe');
    expect(result.lock.isActive).toBe(false);
    expect(result.lock.overrideReason).toBe('Worker left site; area verified safe');
    expect(result.equipmentStatus).toBe(STATUS.UNLOCKED);
    expect(auditService.log).toHaveBeenLastCalledWith(
      201, 'LOCK_OVERRIDDEN', 1, 'lockId=1; reason=Worker left site; area verified safe');
  });

  test('TC-7 (Reliability NFR): if the audit write fails, the lock is rolled back', () => {
    const { service, store, auditService } = setup();
    auditService.log.mockImplementation(() => { throw new Error('database unavailable'); });

    expect(() => service.applyLock(101, 1)).toThrow('database unavailable');
    expect(store.locks.size).toBe(0);
    expect(store.equipment.get(1).status).toBe(STATUS.UNLOCKED);
  });
});
