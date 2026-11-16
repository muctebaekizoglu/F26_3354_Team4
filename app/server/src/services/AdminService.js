// AdminService: users, equipment and worker<->equipment authorizations (FR-3, FR-13, FR-14).
const crypto = require('crypto');
const { AuthService } = require('./AuthService');
const { authKey } = require('../data/store');
const { STATUS } = require('./LockoutService');
const { ValidationError, NotFoundError, ConflictError } = require('../errors');

const ROLES = ['WORKER', 'SUPERVISOR', 'ADMIN'];
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function str(value, label, max = 100) {
  if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(`${label} is required`);
  if (value.trim().length > max) throw new ValidationError(`${label} is too long`);
  return value.trim();
}
function role(value) {
  if (!ROLES.includes(value)) throw new ValidationError(`Role must be one of ${ROLES.join(', ')}`);
  return value;
}

class AdminService {
  constructor({ store, authService, auditService, lockoutService, clock = () => new Date() }) {
    this.store = store;
    this.auth = authService;
    this.audit = auditService;
    this.lockout = lockoutService;
    this.clock = clock;
    this.tempPasswordLength = 12;
  }

  #tempPassword() {
    return Array.from(crypto.randomBytes(this.tempPasswordLength), (b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]).join('');
  }
  #user(userId) {
    const u = this.store.users.get(userId);
    if (!u) throw new NotFoundError(`User ${userId} not found`);
    return u;
  }
  #equipment(equipmentId) {
    const e = this.store.equipment.get(equipmentId);
    if (!e) throw new NotFoundError(`Equipment ${equipmentId} not found`);
    return e;
  }

  // ---------- users (FR-13) ----------
  listUsers() { return [...this.store.users.values()].map(AuthService.publicUser); }

  createUser(data, actorId) {
    const username = str(data?.username, 'Username', 40).toLowerCase();
    const fullName = str(data?.fullName, 'Full name');
    const userRole = role(data?.role);
    if (!/^[a-z0-9._-]+$/.test(username)) throw new ValidationError('Username may only contain letters, digits, dot, dash and underscore');
    if ([...this.store.users.values()].some((u) => u.username.toLowerCase() === username)) throw new ConflictError('Username already exists');
    let password = data.password;
    let tempPassword = null;
    if (password === undefined || password === '') password = tempPassword = this.#tempPassword();
    else if (typeof password !== 'string' || password.length < 8) throw new ValidationError('Password must be at least 8 characters');
    const user = {
      userId: this.store.nextId('user'), username, fullName, role: userRole,
      passwordHash: AuthService.hashPassword(password), isActive: true, failedLoginCount: 0, lockedUntil: null,
    };
    this.store.users.set(user.userId, user);
    this.audit.log(actorId, 'USER_CREATED', null, `userId=${user.userId}; username=${username}; role=${userRole}`);
    return { ...AuthService.publicUser(user), tempPassword };
  }

  updateUser(userId, data, actorId) {
    const user = this.#user(userId);
    if (data.isActive === false) return this.deactivateUser(userId, actorId);
    const changes = [];
    if (data.fullName !== undefined) { user.fullName = str(data.fullName, 'Full name'); changes.push('fullName'); }
    if (data.role !== undefined) {
      const newRole = role(data.role);
      if (userId === actorId && newRole !== user.role) throw new ValidationError('You cannot change your own role');
      user.role = newRole; changes.push(`role=${newRole}`);
    }
    if (data.isActive === true) { user.isActive = true; user.failedLoginCount = 0; user.lockedUntil = null; changes.push('reactivated'); }
    if (data.unlock === true) { user.failedLoginCount = 0; user.lockedUntil = null; changes.push('unlocked'); }
    this.audit.log(actorId, 'USER_UPDATED', null, `userId=${userId}; ${changes.join(', ') || 'no changes'}`);
    return AuthService.publicUser(user);
  }

  deactivateUser(userId, actorId) {
    const user = this.#user(userId);
    if (userId === actorId) throw new ValidationError('You cannot deactivate your own account');
    user.isActive = false;
    this.auth.destroySessionsForUser(userId);
    this.audit.log(actorId, 'USER_DEACTIVATED', null, `userId=${userId}; username=${user.username}`);
    return AuthService.publicUser(user);
  }

  // ---------- equipment (FR-14) ----------
  listEquipment() {
    return this.lockout.getEquipmentStatuses({ includeRetired: true });
  }

  addEquipment(data, actorId) {
    const name = str(data?.name, 'Name');
    const location = str(data?.location, 'Location');
    const eq = { equipmentId: this.store.nextId('equipment'), name, location, status: STATUS.UNLOCKED };
    this.store.equipment.set(eq.equipmentId, eq);
    this.audit.log(actorId, 'EQUIPMENT_ADDED', eq.equipmentId, `name=${name}; location=${location}`);
    return { ...eq };
  }

  updateEquipment(equipmentId, data, actorId) {
    const eq = this.#equipment(equipmentId);
    if (eq.status === STATUS.RETIRED) throw new ValidationError('Retired equipment cannot be edited');
    if (data.name !== undefined) eq.name = str(data.name, 'Name');
    if (data.location !== undefined) eq.location = str(data.location, 'Location');
    this.audit.log(actorId, 'EQUIPMENT_UPDATED', equipmentId, `name=${eq.name}; location=${eq.location}`);
    return { ...eq };
  }

  retireEquipment(equipmentId, actorId) {
    const eq = this.#equipment(equipmentId);
    if (eq.status === STATUS.RETIRED) throw new ValidationError('Equipment is already retired');
    const active = this.lockout.getActiveLocks(equipmentId);
    if (active.length > 0) {
      this.audit.log(actorId, 'RETIRE_REFUSED', equipmentId, `${active.length} active lock(s)`);
      throw new ConflictError(`Cannot retire ${eq.name}: it has ${active.length} active lock(s). Release them first.`);
    }
    eq.status = STATUS.RETIRED;
    this.audit.log(actorId, 'EQUIPMENT_RETIRED', equipmentId, `name=${eq.name}`);
    return { ...eq };
  }

  // ---------- worker <-> equipment authorizations ----------
  listAuthorizations() {
    return [...this.store.authorizations.values()].map((a) => ({ ...a }));
  }

  grantAuthorization(userId, equipmentId, actorId) {
    const user = this.#user(userId);
    const eq = this.#equipment(equipmentId);
    if (user.role === 'ADMIN') throw new ValidationError('Admins do not operate equipment locks');
    if (eq.status === STATUS.RETIRED) throw new ValidationError('Equipment is retired');
    const key = authKey(userId, equipmentId);
    if (!this.store.authorizations.has(key)) {
      this.store.authorizations.set(key, { userId, equipmentId, grantedAt: this.clock() });
      this.audit.log(actorId, 'AUTHORIZATION_GRANTED', equipmentId, `userId=${userId}`);
    }
    return { userId, equipmentId };
  }

  revokeAuthorization(userId, equipmentId, actorId) {
    this.#user(userId); this.#equipment(equipmentId);
    if (this.store.authorizations.delete(authKey(userId, equipmentId))) {
      this.audit.log(actorId, 'AUTHORIZATION_REVOKED', equipmentId, `userId=${userId}`);
    }
  }
}

module.exports = { AdminService, ROLES };
