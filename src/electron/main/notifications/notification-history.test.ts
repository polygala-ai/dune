// Notification history tests.

import { describe, expect, it } from 'vitest';

import { NotificationHistory } from './notification-history';
import {
  NotificationChannel,
  NotificationTrigger,
} from './types';

describe('NotificationHistory', () => {
  it('keeps only the latest 50 records in reverse chronological order', () => {
    const history = new NotificationHistory();

    for (let index = 0; index < 55; index += 1) {
      history.add({
        id: `notification-${index}`,
        timestamp: index,
        trigger: NotificationTrigger.ItemReview,
        channel: NotificationChannel.MacOS,
        title: `Title ${index}`,
        body: `Body ${index}`,
      });
    }

    const records = history.getAll();

    expect(records).toHaveLength(50);
    expect(records[0]?.id).toBe('notification-54');
    expect(records.at(-1)?.id).toBe('notification-5');
  });

  it('clears the in-memory log', () => {
    const history = new NotificationHistory();

    history.add({
      id: 'notification-1',
      timestamp: 1,
      trigger: NotificationTrigger.ItemReview,
      channel: NotificationChannel.MacOS,
      title: 'Title',
      body: 'Body',
    });
    history.clear();

    expect(history.getAll()).toEqual([]);
  });
});
