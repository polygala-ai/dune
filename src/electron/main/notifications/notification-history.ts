// In-memory notification history.

import type { NotificationRecord } from './types';
import { NOTIFICATION_HISTORY_LIMIT } from './types';

/** Rolling in-memory notification log. */
export class NotificationHistory {
  private readonly records: NotificationRecord[] = [];

  /** Adds a notification record. */
  add(record: NotificationRecord) {
    this.records.unshift({ ...record });

    if (this.records.length > NOTIFICATION_HISTORY_LIMIT) {
      this.records.length = NOTIFICATION_HISTORY_LIMIT;
    }
  }

  /** Returns history, newest first. */
  getAll() {
    return this.records.map((record) => ({ ...record }));
  }

  /** Clears all history. */
  clear() {
    this.records.length = 0;
  }
}
