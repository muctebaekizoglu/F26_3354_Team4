const crypto = require('crypto');

// Append-only, tamper-evident log (FR-8): each entry stores the hash of the previous entry.
class AuditService {
  constructor(repo) { this.repo = repo; }

  log(action, userId, equipmentId, details = {}) {
    const entry = {
      id: this.repo.getAudit().length + 1,
      timestamp: new Date().toISOString(),
      action, userId, equipmentId, details,
      prevHash: this.repo.lastAuditHash(),
    };
    entry.hash = AuditService.hashEntry(entry);
    return this.repo.appendAudit(entry);
  }

  static hashEntry(e) {
    const { hash, ...rest } = e;
    return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
  }

  query() { return [...this.repo.getAudit()]; }

  verifyChain() {
    let prev = 'GENESIS';
    for (const e of this.repo.getAudit()) {
      if (e.prevHash !== prev || e.hash !== AuditService.hashEntry(e)) return false;
      prev = e.hash;
    }
    return true;
  }
}
module.exports = { AuditService };
