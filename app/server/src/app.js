// Composition root: builds the store, the services and the Express app.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createStore } = require('./data/store');
const { seed } = require('./data/seed');
const { AuditService } = require('./services/AuditService');
const { NotificationService } = require('./services/NotificationService');
const { AuthService } = require('./services/AuthService');
const { LockoutService } = require('./services/LockoutService');
const { ReportService } = require('./services/ReportService');
const { AdminService } = require('./services/AdminService');
const { createApiRouter } = require('./routes/api');

function createApp({ clock = () => new Date(), secret, seedData = true } = {}) {
  const store = createStore();
  const auditService = new AuditService({ store, clock });
  const notificationService = new NotificationService({ store, clock });
  const authService = new AuthService({ store, auditService, clock, secret });
  const lockoutService = new LockoutService({ store, authService, auditService, notificationService, clock });
  const reportService = new ReportService({ store, authService, auditService, clock });
  const adminService = new AdminService({ store, authService, auditService, lockoutService, clock });
  const services = { authService, lockoutService, auditService, notificationService, reportService, adminService };
  if (seedData) seed({ store, auditService, lockoutService, notificationService });

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '20kb' }));
  app.use('/api', createApiRouter(services));

  // Optional: serve the built client (npm run build) from the same origin.
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // JSON for every error response.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.status && err.status < 500) {
      const body = { error: err.message };
      if (err.lockedUntil) { body.locked = true; body.lockedUntil = err.lockedUntil; }
      return res.status(err.status).json(body);
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return { app, store, services };
}

module.exports = { createApp };
