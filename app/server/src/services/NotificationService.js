// NotificationService: in-app status-change notifications (FR-10).
class NotificationService {
  constructor({ store, clock = () => new Date() }) {
    this.store = store;
    this.clock = clock;
    this.pollIntervalSec = 5;
  }

  /** Creates one notification per active user. */
  notifyStatusChange(equipment) {
    let message = `${equipment.name} was ${equipment.status}`;
    if (equipment.status === 'LOCKED') {
      const latest = [...this.store.locks.values()]
        .filter((l) => l.equipmentId === equipment.equipmentId && l.isActive)
        .sort((a, b) => b.lockId - a.lockId)[0];
      const holder = latest && this.store.users.get(latest.workerId);
      if (holder) message += ` by ${holder.fullName}`;
    }
    const createdAt = this.clock();
    for (const user of this.store.users.values()) {
      if (!user.isActive) continue;
      const notificationId = this.store.nextId('notification');
      this.store.notifications.set(notificationId, {
        notificationId, userId: user.userId, equipmentId: equipment.equipmentId,
        status: equipment.status, message, createdAt, isRead: false,
      });
    }
  }

  getUnread(userId) {
    return [...this.store.notifications.values()]
      .filter((n) => n.userId === userId && !n.isRead)
      .sort((a, b) => a.notificationId - b.notificationId)
      .map((n) => ({ ...n }));
  }

  markRead(userId, notificationId) {
    const n = this.store.notifications.get(notificationId);
    if (n && n.userId === userId) n.isRead = true;
    return !!n && n.userId === userId;
  }

  markAllRead(userId) {
    for (const n of this.store.notifications.values()) if (n.userId === userId) n.isRead = true;
  }
}

module.exports = { NotificationService };
