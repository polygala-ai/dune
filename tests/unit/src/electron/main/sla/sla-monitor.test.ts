// SLA monitor tests.

import { describe, expect, it, vi } from 'vitest';

import { createSlaMonitor } from '@/electron/main/sla/sla-monitor';
import type { AppStorage } from '@/electron/main/storage';

function createMemoryStore(snapshot: unknown) {
  let value = snapshot;
  const setSpy = vi.fn();

  const store: AppStorage = {
    delete: vi.fn(async () => undefined),
    get: async <T,>() => value as T | null,
    keys: vi.fn(async () => []),
    set: async <T,>(_key: string, next: T) => {
      setSpy(_key, next);
      value = next;
    },
  };

  return Object.assign(store, { setSpy });
}

describe('createSlaMonitor', () => {
  it('warns and breaches once while skipping terminal items', async () => {
    const now = new Date('2026-04-24T12:00:00.000Z').getTime();
    const store = createMemoryStore({
      items: [
        {
          id: 'warn',
          status: 'active',
          title: 'Warn item',
          slaDeadlineMs: now + 60 * 60_000,
          workflowEvents: [],
        },
        {
          id: 'breach',
          status: 'review',
          title: 'Breach item',
          slaDeadlineMs: now - 1,
          workflowEvents: [],
        },
        {
          id: 'done',
          status: 'done',
          title: 'Done item',
          slaDeadlineMs: now - 1,
          workflowEvents: [],
        },
      ],
      projects: [],
    });
    const notifySla = vi.fn();
    const notifyWorkflowChanged = vi.fn();
    const monitor = createSlaMonitor({
      notifySla,
      notifyWorkflowChanged,
      now: () => now,
      workflowStore: store,
    });

    await monitor.checkNow();
    await monitor.checkNow();

    expect(notifySla).toHaveBeenCalledTimes(2);
    expect(notifySla).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'warn', type: 'sla_warning' }));
    expect(notifySla).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'breach', type: 'sla_breach' }));
    expect(notifyWorkflowChanged).toHaveBeenCalledTimes(1);
    expect(store.setSpy).toHaveBeenCalledTimes(1);
  });
});
