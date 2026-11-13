// AuthService: authentication (FR-1, FR-2), sessions, and RBAC / equipment authorization (FR-3).
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AuthenticationError, AccountLockedError } = require('../errors');
const { authKey } = require('../data/store');

const BCRYPT_COST = 10;
const GENERIC_FAILURE = 'Invalid username or password';
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const publicUser = (u) => u && ({
  userId: u.userId, username: u.username, fullName: u.fullName, role: u.role, isActive: u.isActive,
});

class AuthService {
  constructor({ store, auditService, clock = () => new Date(), secret = process.env.SESSION_SECRET }) {
    this.store = store;
    this.audit = auditService;
    this.clock = clock;
    // Without SESSION_SECRET a random per-process secret is used (sessions reset on restart).
    this.secret = secret || crypto.randomBytes(32).toString('hex');
    this.maxFailedAttempts = 5;
    this.lockoutMinutes = 15;
    this.sessionTimeoutMin = 30;
    this.sessions = new Map(); // sessionId -> { userId, lastActive (ms) }
  }

  static hashPassword(password) { return bcrypt.hashSync(password, BCRYPT_COST); }
  static publicUser(u) { return publicUser(u); }

  /** Returns { user, token } or throws AuthenticationError / AccountLockedError. */
  authenticate(username, password) {
    const now = this.clock();
    const name = String(username ?? '').trim().toLowerCase();
    const user = [...this.store.users.values()].find((u) => u.username.toLowerCase() === name);

    if (!user) {
      bcrypt.compareSync(String(password ?? ''), DUMMY_HASH); // equalise timing
      this.audit.log(null, 'LOGIN_FAILED', null, `unknown username: ${name.slice(0, 40)}`);
      throw new AuthenticationError(GENERIC_FAILURE);
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      this.audit.log(user.userId, 'LOGIN_FAILED', null, 'account locked');
      throw new AccountLockedError(
        `Account locked for ${this.lockoutMinutes} minutes after ${this.maxFailedAttempts} failed attempts. Try again later or contact an administrator.`,
        user.lockedUntil);
    }
    if (user.lockedUntil) { user.lockedUntil = null; user.failedLoginCount = 0; }

    const passwordOk = bcrypt.compareSync(String(password ?? ''), user.passwordHash);
    if (!passwordOk || !user.isActive) {
      if (user.isActive) {
        user.failedLoginCount += 1;
        if (user.failedLoginCount >= this.maxFailedAttempts) {
          user.lockedUntil = new Date(now.getTime() + this.lockoutMinutes * 60000);
        }
      }
      this.audit.log(user.userId, 'LOGIN_FAILED', null, user.isActive ? 'bad password' : 'deactivated account');
      throw new AuthenticationError(GENERIC_FAILURE);
    }

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    this.audit.log(user.userId, 'LOGIN_SUCCESS', null, '');
    return { user: publicUser(user), token: this.#createSession(user.userId) };
  }

  /** FR-3 / FR-7 / FR-11: may this user perform `action` (APPLY, RELEASE, OVERRIDE, VIEW_REPORT)? */
  authorize(userOrId, equipmentId, action) {
    const user = typeof userOrId === 'object' && userOrId ? userOrId : this.store.users.get(userOrId);
    if (!user || !user.isActive) return false;
    switch (action) {
      case 'APPLY':
      case 'RELEASE': // a supervisor can do everything a worker can
        return (user.role === 'WORKER' || user.role === 'SUPERVISOR')
          && this.store.authorizations.has(authKey(user.userId, equipmentId));
      case 'OVERRIDE':
        return user.role === 'SUPERVISOR';
      case 'VIEW_REPORT':
        return user.role === 'SUPERVISOR' || user.role === 'ADMIN';
      case 'ADMIN':
        return user.role === 'ADMIN';
      default:
        return false;
    }
  }

  // ---- sessions: signed id, kept server-side, 30 minutes of inactivity ----
  #sign(id) { return crypto.createHmac('sha256', this.secret).update(id).digest('hex'); }

  #createSession(userId) {
    const id = crypto.randomBytes(24).toString('hex');
    this.sessions.set(id, { userId, lastActive: this.clock().getTime() });
    return `${id}.${this.#sign(id)}`;
  }

  /** Returns the (internal) user for a valid, unexpired session token, else null. */
  getUserForToken(token) {
    if (typeof token !== 'string') return null;
    const [id, sig] = token.split('.');
    if (!id || !sig) return null;
    const expected = this.#sign(id);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    const now = this.clock().getTime();
    if (now - session.lastActive > this.sessionTimeoutMin * 60000) { this.sessions.delete(id); return null; }
    const user = this.store.users.get(session.userId);
    if (!user || !user.isActive) { this.sessions.delete(id); return null; }
    session.lastActive = now;
    return user;
  }

  destroySession(token) {
    if (typeof token === 'string') this.sessions.delete(token.split('.')[0]);
  }

  destroySessionsForUser(userId) {
    for (const [id, s] of this.sessions) if (s.userId === userId) this.sessions.delete(id);
  }
}

module.exports = { AuthService, GENERIC_FAILURE };
