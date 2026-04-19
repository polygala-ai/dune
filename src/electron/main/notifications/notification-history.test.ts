// Notification history tests.

import { describe, expect, it } from 'vitest';

import { NotificationHistory } from './notification-history';

describe('NotificationHistory', () => {
  it('keeps only the latest 50 records in reverse chronological order', () => {
    const history = new NotificationHistory();

    for (let index = 0; index < 55; index += 1) {
      history.add({
        body: `Body ${index}`,
        id: `notification-${index}`,
        timestamp: index,
        title: `Title ${index}`,
        trigger: 'item_review',
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
      body: 'Body',
      id: 'notification-1',
      timestamp: 1,
      title: 'Title',
      trigger: 'item_review',
    });
    history.clear();

    expect(history.getAll()).toEqual([]);
  });
});
