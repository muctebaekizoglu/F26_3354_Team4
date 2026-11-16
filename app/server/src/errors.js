// Re-exports the error types from the unit-tested LockoutService and adds the
// extra HTTP-level errors the API needs. Each error carries its HTTP status.
const base = require('../../../loto-unit-test/src/errors');

class AuthenticationError extends Error {
  constructor(message = 'Authentication required') { super(message); this.name = 'AuthenticationError'; this.status = 401; }
}
class AccountLockedError extends Error {
  constructor(message, lockedUntil) { super(message); this.name = 'AccountLockedError'; this.status = 423; this.lockedUntil = lockedUntil; }
}
class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; this.status = 409; }
}

module.exports = { ...base, AuthenticationError, AccountLockedError, ConflictError };
