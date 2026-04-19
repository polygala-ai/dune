// Rolling in-memory notification history.

import type { NotificationRecord } from './types';

export class NotificationHistory {
  private records: NotificationRecord[] = [];

  private readonly maxSize = 50;

  add(record: NotificationRecord): void {
    this.records.unshift(record);
    if (this.records.length > this.maxSize) {
      this.records.pop();
    }
  }

  getAll(): NotificationRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }
}
