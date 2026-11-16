// AuditService: append-only, hash-chained audit log (FR-8, FR-11).
const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

function computeHash(e) {
  const fields = JSON.stringify([e.entryId, e.timestamp, e.actorId, e.action, e.equipmentId, e.details]);
  return crypto.createHash('sha256').update(e.prevHash + fields).digest('hex');
}

function parseBound(value, isEnd) {
  if (value === undefined || value === null || value === '') return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const d = new Date(dateOnly ? `${value}T${isEnd ? '23:59:59.999' : '00:00:00.000'}Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

class AuditService {
  constructor({ store, clock = () => new Date() }) {
    this.store = store;
    this.clock = clock;
    this.lastHash = GENESIS_HASH;
  }

  /** Appends an entry. There is deliberately no update or delete method. */
  log(actorId, action, equipmentId, details) {
    const entry = {
      entryId: this.store.nextId('audit'),
      timestamp: this.clock().toISOString(),
      actorId: actorId ?? null,
      action,
      equipmentId: equipmentId ?? null,
      details: details ?? '',
      prevHash: this.lastHash,
    };
    entry.hash = computeHash(entry);
    this.store.audit.set(entry.entryId, Object.freeze(entry));
    this.lastHash = entry.hash;
    return { ...entry };
  }

  /** filters: { from, to, equipmentId, workerId, action } - all optional. Oldest first. */
  query(filters = {}) {
    const from = parseBound(filters.from, false);
    const to = parseBound(filters.to, true);
    const eq = filters.equipmentId ? Number(filters.equipmentId) : null;
    const worker = filters.workerId ? Number(filters.workerId) : null;
    const action = filters.action || null;
    return [...this.store.audit.values()]
      .filter((e) => {
        const t = new Date(e.timestamp);
        return (!from || t >= from) && (!to || t <= to)
          && (!eq || e.equipmentId === eq)
          && (!worker || e.actorId === worker)
          && (!action || e.action === action);
      })
      .map((e) => ({ ...e }));
  }

  /** Recomputes the chain; returns { valid, entries, brokenAt }. */
  verifyChain() {
    let prev = GENESIS_HASH;
    const entries = [...this.store.audit.values()];
    for (const e of entries) {
      if (e.prevHash !== prev || e.hash !== computeHash(e)) return { valid: false, entries: entries.length, brokenAt: e.entryId };
      prev = e.hash;
    }
    return { valid: true, entries: entries.length, brokenAt: null };
  }
}

module.exports = { AuditService, GENESIS_HASH, computeHash };
