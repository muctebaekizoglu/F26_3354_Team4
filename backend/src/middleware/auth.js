const { AppError } = require('../errors');

// TEMPORARY stand-in for Zoe's AuthService. Reads the user id from the "x-user-id" header.
// When login/sessions exist, replace this ONE function so it sets req.userId from the session.
function authenticate(req, res, next) {
  const id = req.header('x-user-id');
  if (!id) return next(new AppError(401, 'UNAUTHENTICATED', 'Missing x-user-id header'));
  req.userId = id;
  next();
}
module.exports = { authenticate };
