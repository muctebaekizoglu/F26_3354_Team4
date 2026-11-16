const express = require('express');
const { MemoryRepo } = require('./repositories/memoryRepo');
const { AuditService } = require('./services/auditService');
const { LockoutService } = require('./services/lockoutService');
const lockoutRoutes = require('./routes/lockouts');

function createApp(repo = new MemoryRepo()) {
  const audit = new AuditService(repo);
  const lockoutService = new LockoutService(repo, audit);
  const app = express();
  app.use(express.json());
  app.use('/api', lockoutRoutes(lockoutService, repo));

  // Central error handler: AppError -> its status; anything else -> 500 (fail safe, no details leaked)
  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });
  return { app, repo, audit, lockoutService };
}
module.exports = { createApp };
