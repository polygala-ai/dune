// In-memory rolling notification history.

import type { NotificationRecord } from './types';

const MAX_HISTORY_ENTRIES = 50;

/** Rolling notification history store. */
export class NotificationHistory {
  private records: NotificationRecord[] = [];

  /** Adds a record to the top of the history. */
  add(record: NotificationRecord) {
    this.records = [record, ...this.records].slice(0, MAX_HISTORY_ENTRIES);
  }

  /** Returns the current history, newest first. */
  getAll(): NotificationRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  /** Clears the current history. */
  clear() {
    this.records = [];
  }
}
