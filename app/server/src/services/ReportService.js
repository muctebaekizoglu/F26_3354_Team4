// ReportService: compliance report over the audit log (FR-11) and RFC 4180 CSV export (FR-12).
const { AuthorizationError } = require('../errors');

const COLUMNS = ['Entry ID', 'Timestamp', 'Actor', 'Action', 'Equipment', 'Details', 'Hash'];

function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

class ReportService {
  constructor({ store, authService, auditService, clock = () => new Date() }) {
    this.store = store;
    this.auth = authService;
    this.audit = auditService;
    this.clock = clock;
    this.maxRows = 10000;
  }

  #requireAccess(userId) {
    if (!this.auth.authorize(userId, null, 'VIEW_REPORT')) throw new AuthorizationError('Only supervisors and admins can view reports');
  }

  /** Returns { generatedAt, filters, count, total, truncated, entries } - newest first. */
  generate(filters = {}, userId) {
    this.#requireAccess(userId);
    const all = this.audit.query(filters).reverse();
    const entries = all.slice(0, this.maxRows).map((e) => ({
      ...e,
      actorName: e.actorId ? this.store.users.get(e.actorId)?.fullName ?? `User ${e.actorId}` : null,
      equipmentName: e.equipmentId ? this.store.equipment.get(e.equipmentId)?.name ?? `Equipment ${e.equipmentId}` : null,
    }));
    return { generatedAt: this.clock().toISOString(), filters, count: entries.length, total: all.length, truncated: all.length > entries.length, entries };
  }

  /** People who can appear as the actor of an audit entry (for the worker filter). */
  listActors(userId) {
    this.#requireAccess(userId);
    return [...this.store.users.values()].map((u) => ({ userId: u.userId, fullName: u.fullName, role: u.role }));
  }

  /** Builds CSV for the same filters (one data row per result) and audits the export. */
  exportCsv(filters = {}, userId) {
    const report = this.generate(filters, userId);
    const rows = report.entries.map((e) => [e.entryId, e.timestamp, e.actorName ?? '', e.action, e.equipmentName ?? '', e.details, e.hash]);
    const csv = [COLUMNS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    this.audit.log(userId, 'REPORT_EXPORTED', null, `rows=${report.count}`);
    return { csv, count: report.count };
  }
}

module.exports = { ReportService, csvCell };
