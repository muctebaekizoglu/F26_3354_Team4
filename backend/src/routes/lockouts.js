const express = require('express');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../errors');

module.exports = function lockoutRoutes(lockoutService, repo) {
  const router = express.Router();
  router.use(authenticate);

  // Apply a lock (UC-2)
  router.post('/lockouts', (req, res) => {
    const { equipmentId } = req.body || {};
    if (!equipmentId) throw new AppError(400, 'BAD_REQUEST', 'equipmentId is required');
    res.status(201).json(lockoutService.applyLock(req.userId, equipmentId));
  });

  router.get('/lockouts', (req, res) => {
    res.json(lockoutService.listLocks({ equipmentId: req.query.equipmentId, status: req.query.status }));
  });

  router.get('/lockouts/:id', (req, res) => res.json(lockoutService.getLock(req.params.id)));

  // Release a lock (UC-3)
  router.post('/lockouts/:id/release', (req, res) => {
    res.json(lockoutService.releaseLock(req.userId, req.params.id));
  });

  // Supervisor override (UC-3 extension)
  router.post('/lockouts/:id/override', (req, res) => {
    res.json(lockoutService.overrideRelease(req.userId, req.params.id, (req.body || {}).reason));
  });

  router.get('/equipment', (req, res) => {
    res.json(repo.listEquipment().map(e => lockoutService.getEquipmentStatus(e.id)));
  });

  router.get('/equipment/:id/status', (req, res) => res.json(lockoutService.getEquipmentStatus(req.params.id)));

  return router;
};
