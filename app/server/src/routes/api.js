// REST API under /api. Routes only parse input, check the caller's role and delegate to services.
const express = require('express');
const { AuthenticationError, AuthorizationError, ValidationError } = require('../errors');

const COOKIE = 'loto_session';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function toId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
}

function createApiRouter({ authService, lockoutService, notificationService, reportService, adminService, auditService }) {
  const router = express.Router();
  const wrap = (fn) => (req, res, next) => {
    try {
      const result = fn(req, res);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (err) { next(err); }
  };

  const requireAuth = (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const user = authService.getUserForToken(token);
    if (!user) return next(new AuthenticationError('Not logged in'));
    req.user = user;
    req.token = token;
    return next();
  };
  const requireAction = (action) => (req, res, next) => (
    authService.authorize(req.user, null, action) ? next() : next(new AuthorizationError('You do not have permission to do this')));

  // ---- auth ----
  router.post('/auth/login', wrap((req, res) => {
    const { user, token } = authService.authenticate(req.body?.username, req.body?.password);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
    return { user };
  }));
  router.post('/auth/logout', requireAuth, wrap((req, res) => {
    authService.destroySession(req.token);
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }));
  router.get('/auth/me', requireAuth, wrap((req) => ({ user: authService.constructor.publicUser(req.user) })));

  // Everything below needs a session.
  router.use(requireAuth);

  // ---- equipment and locks ----
  router.get('/equipment', wrap(() => ({ equipment: lockoutService.getEquipmentStatuses() })));
  router.get('/equipment/:id', wrap((req) => {
    const equipment = lockoutService.getEquipmentDetail(toId(req.params.id));
    const canApply = authService.authorize(req.user, equipment.equipmentId, 'APPLY');
    return { equipment, permissions: { canApply, canOverride: authService.authorize(req.user, equipment.equipmentId, 'OVERRIDE') } };
  }));
  router.post('/equipment/:id/locks', wrap((req, res) => {
    const lock = lockoutService.applyLock(req.user.userId, toId(req.params.id));
    res.status(201);
    return { lock, equipment: lockoutService.getEquipmentDetail(lock.equipmentId) };
  }));
  router.post('/locks/:lockId/release', wrap((req) => {
    const { lock, equipmentStatus } = lockoutService.releaseLock(req.user.userId, toId(req.params.lockId, 'lock id'));
    return { lock, equipmentStatus };
  }));
  router.post('/locks/:lockId/override', wrap((req) => {
    const { lock, equipmentStatus } = lockoutService.overrideRelease(req.user.userId, toId(req.params.lockId, 'lock id'), req.body?.reason);
    return { lock, equipmentStatus };
  }));

  // ---- notifications ----
  router.get('/notifications', wrap((req) => ({ notifications: notificationService.getUnread(req.user.userId) })));
  router.post('/notifications/read-all', wrap((req) => { notificationService.markAllRead(req.user.userId); return { ok: true }; }));
  router.post('/notifications/:id/read', wrap((req) => ({ ok: notificationService.markRead(req.user.userId, toId(req.params.id)) })));

  // ---- audit / compliance report (supervisor + admin) ----
  const filtersFrom = (q) => ({ from: q.from, to: q.to, equipmentId: q.equipmentId, workerId: q.workerId, action: q.action });
  router.get('/audit', requireAction('VIEW_REPORT'), wrap((req) => reportService.generate(filtersFrom(req.query), req.user.userId)));
  router.get('/audit/actors', requireAction('VIEW_REPORT'), wrap((req) => ({ actors: reportService.listActors(req.user.userId) })));
  router.get('/audit/verify', requireAction('VIEW_REPORT'), wrap(() => auditService.verifyChain()));
  router.get('/audit/export', requireAction('VIEW_REPORT'), wrap((req, res) => {
    const { csv, count } = reportService.exportCsv(filtersFrom(req.query), req.user.userId);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="loto-compliance-report.csv"',
      'X-Row-Count': String(count),
    });
    res.send(csv);
  }));

  // ---- admin ----
  const admin = express.Router();
  admin.use(requireAction('ADMIN'));
  admin.get('/users', wrap(() => ({ users: adminService.listUsers() })));
  admin.post('/users', wrap((req, res) => { res.status(201); return { user: adminService.createUser(req.body ?? {}, req.user.userId) }; }));
  admin.patch('/users/:id', wrap((req) => ({ user: adminService.updateUser(toId(req.params.id), req.body ?? {}, req.user.userId) })));
  admin.post('/users/:id/deactivate', wrap((req) => ({ user: adminService.deactivateUser(toId(req.params.id), req.user.userId) })));
  admin.get('/equipment', wrap(() => ({ equipment: adminService.listEquipment() })));
  admin.post('/equipment', wrap((req, res) => { res.status(201); return { equipment: adminService.addEquipment(req.body ?? {}, req.user.userId) }; }));
  admin.patch('/equipment/:id', wrap((req) => ({ equipment: adminService.updateEquipment(toId(req.params.id), req.body ?? {}, req.user.userId) })));
  admin.post('/equipment/:id/retire', wrap((req) => ({ equipment: adminService.retireEquipment(toId(req.params.id), req.user.userId) })));
  admin.get('/authorizations', wrap(() => ({ authorizations: adminService.listAuthorizations() })));
  admin.post('/authorizations', wrap((req, res) => {
    res.status(201);
    return { authorization: adminService.grantAuthorization(toId(req.body?.userId, 'user id'), toId(req.body?.equipmentId, 'equipment id'), req.user.userId) };
  }));
  admin.delete('/authorizations/:userId/:equipmentId', wrap((req) => {
    adminService.revokeAuthorization(toId(req.params.userId, 'user id'), toId(req.params.equipmentId, 'equipment id'), req.user.userId);
    return { ok: true };
  }));
  router.use('/admin', admin);

  // JSON 404 for unknown API paths.
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { createApiRouter };
