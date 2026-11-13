// Simple error type so services can say "what went wrong" and the API can map it to an HTTP status.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
module.exports = { AppError };
