const { MemoryRepo } = require('../src/repositories/memoryRepo');
const { AuditService } = require('../src/services/auditService');
const { LockoutService } = require('../src/services/lockoutService');

let repo, audit, svc;
beforeEach(() => {
  repo = new MemoryRepo(); repo.seedDemoData();
  audit = new AuditService(repo);
  svc = new LockoutService(repo, audit);
});

describe('Apply Lock (FR-3, FR-4)', () => {
  test('TC-1 authorized worker locks equipment: lock stored, status LOCKED, audit entry', () => {
    const lock = svc.applyLock('w1', 'e1');
    expect(lock.workerId).toBe('w1');
    expect(lock.status).toBe('ACTIVE');
    expect(svc.getEquipmentStatus('e1').status).toBe('LOCKED');
    expect(audit.query().map(a => a.action)).toContain('LOCK_APPLIED');
  });
  test('TC-2 unauthorized worker refused and LOCK_DENIED logged', () => {
    expect(() => svc.applyLock('w2', 'e2')).toThrow('not authorized');
    expect(audit.query().map(a => a.action)).toContain('LOCK_DENIED');
    expect(svc.getEquipmentStatus('e2').status).toBe('UNLOCKED');
  });
  test('TC-3 unknown equipment returns not found', () => {
    expect(() => svc.applyLock('w1', 'nope')).toThrow('Equipment not found');
  });
});

describe('Release Lock (FR-5, FR-6, FR-7)', () => {
  test('TC-4 owner releases lock: equipment becomes UNLOCKED', () => {
    const lock = svc.applyLock('w1', 'e1');
    svc.releaseLock('w1', lock.id);
    expect(svc.getEquipmentStatus('e1').status).toBe('UNLOCKED');
  });
  test('TC-5 another worker cannot release; refused and logged', () => {
    const lock = svc.applyLock('w1', 'e1');
    expect(() => svc.releaseLock('w2', lock.id)).toThrow('Only the worker');
    expect(svc.getEquipmentStatus('e1').status).toBe('LOCKED');
    expect(audit.query().map(a => a.action)).toContain('RELEASE_DENIED');
  });
  test('TC-6 group lockout: stays LOCKED until both locks released', () => {
    const a = svc.applyLock('w1', 'e1');
    const b = svc.applyLock('w2', 'e1');
    svc.releaseLock('w1', a.id);
    expect(svc.getEquipmentStatus('e1').status).toBe('LOCKED');
    svc.releaseLock('w2', b.id);
    expect(svc.getEquipmentStatus('e1').status).toBe('UNLOCKED');
  });
  test('TC-7 override with empty reason refused', () => {
    const lock = svc.applyLock('w1', 'e1');
    expect(() => svc.overrideRelease('s1', lock.id, '  ')).toThrow('written reason');
  });
  test('TC-8 supervisor override with reason succeeds and reason is logged', () => {
    const lock = svc.applyLock('w1', 'e1');
    svc.overrideRelease('s1', lock.id, 'Worker left shift');
    expect(svc.getEquipmentStatus('e1').status).toBe('UNLOCKED');
    const entry = audit.query().find(a => a.action === 'LOCK_OVERRIDE_RELEASED');
    expect(entry.userId).toBe('s1');
    expect(entry.details.reason).toBe('Worker left shift');
  });
  test('TC-9 worker cannot use override', () => {
    const lock = svc.applyLock('w1', 'e1');
    expect(() => svc.overrideRelease('w2', lock.id, 'x')).toThrow('Only supervisors');
  });
});

describe('Audit log (FR-8)', () => {
  test('TC-10 hash chain verifies, and fails if an entry is tampered with', () => {
    const lock = svc.applyLock('w1', 'e1');
    svc.releaseLock('w1', lock.id);
    expect(audit.verifyChain()).toBe(true);
    repo.getAudit()[0].userId = 'hacker';
    expect(audit.verifyChain()).toBe(false);
  });
});
