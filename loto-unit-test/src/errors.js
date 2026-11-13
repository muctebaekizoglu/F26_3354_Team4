// Errors thrown by LockoutService. Each maps to an HTTP status in the API layer.
class AuthorizationError extends Error {
  constructor(message) { super(message); this.name = 'AuthorizationError'; this.status = 403; }
}
class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; this.status = 400; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; this.status = 404; }
}
module.exports = { AuthorizationError, ValidationError, NotFoundError };
