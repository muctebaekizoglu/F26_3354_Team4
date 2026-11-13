// In-memory data layer. Shaped like the `store` that LockoutService expects
// ({ equipment: Map, locks: Map, nextLockId() }) plus the other collections.
// Only services read or write it. Replace this module with a PostgreSQL-backed
// data-access layer later without touching the services' public methods.
// NOTE: LockoutService may reassign store.equipment / store.locks (rollback), so
// always read them through the store object and never cache the Map references.
function createStore() {
  const counters = { lock: 0, user: 0, equipment: 0, audit: 0, notification: 0 };
  const nextId = (kind) => ++counters[kind];
  return {
    users: new Map(),            // userId -> user
    equipment: new Map(),        // equipmentId -> equipment
    locks: new Map(),            // lockId -> lock
    authorizations: new Map(),   // "userId:equipmentId" -> { userId, equipmentId, grantedAt }
    audit: new Map(),            // entryId -> frozen audit entry
    notifications: new Map(),    // notificationId -> notification
    nextLockId: () => nextId('lock'),
    nextId,
  };
}

const authKey = (userId, equipmentId) => `${userId}:${equipmentId}`;

module.exports = { createStore, authKey };
