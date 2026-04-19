// Notification manager tests.

import { describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage';
import type {
  NotificationSettings,
  NotificationTrigger,
} from './types';
import { NotificationManager } from './notification-manager';

function createMemoryStore(initialData: Record<string, unknown> = {}): AppStorage {
  const data = new Map<string, unknown>(Object.entries(initialData));

  return {
    delete: async (key) => {
      data.delete(key);
    },
    get: async <T,>(key: string) => (data.get(key) as T) ?? null,
    keys: async () => [...data.keys()],
    set: async <T,>(key: string, value: T) => {
      data.set(key, value);
    },
  };
}

function createNotificationSettings(
  partial: {
    channels?: Partial<NotificationSettings['channels']>;
    doNotDisturb?: Partial<NotificationSettings['doNotDisturb']>;
    telegramNotifyChatId?: string;
    triggers?: Partial<Record<NotificationTrigger, boolean>>;
  } = {},
): NotificationSettings {
  return {
    channels: {
      macos: true,
      telegram: false,
      ...(partial.channels ?? {}),
    },
    doNotDisturb: {
      enabled: false,
      endHour: 8,
      startHour: 23,
      ...(partial.doNotDisturb ?? {}),
    },
    telegramNotifyChatId: '',
    ...(partial.telegramNotifyChatId !== undefined
      ? { telegramNotifyChatId: partial.telegramNotifyChatId }
      : {}),
    triggers: {
      agent_error: true,
      agent_idle: false,
      budget_warning: true,
      item_acceptance: true,
      item_review: true,
      ...(partial.triggers ?? {}),
    },
  };
}

describe('NotificationManager', () => {
  it('loads defaults and deep-merges settings updates', async () => {
    const manager = new NotificationManager({
      store: createMemoryStore(),
    });

    expect(await manager.getSettings()).toEqual(createNotificationSettings());

    const nextSettings = await manager.updateSettings({
      channels: { telegram: true },
      doNotDisturb: { enabled: true, startHour: 21 },
      telegramNotifyChatId: 'tg:12345',
      triggers: { agent_idle: true },
    });

    expect(nextSettings).toEqual(createNotificationSettings({
      channels: { telegram: true },
      doNotDisturb: { enabled: true, startHour: 21 },
      telegramNotifyChatId: 'tg:12345',
      triggers: { agent_idle: true },
    }));
  });

  it('suppresses notifications during a midnight-crossing DnD window', async () => {
    const macosSend = vi.fn();
    const manager = new NotificationManager({
      macosNotifier: { send: macosSend },
      now: () => new Date(2026, 0, 1, 2, 0, 0, 0).getTime(),
      store: createMemoryStore({
        notifications: createNotificationSettings({
          doNotDisturb: {
            enabled: true,
            endHour: 8,
            startHour: 23,
          },
        }),
      }),
    });

    const notification = await manager.notify('item_review', {
      body: 'Landing page QA pass',
      itemId: 'item-1',
      title: 'Review ready',
    });

    expect(notification).toBeNull();
    expect(macosSend).not.toHaveBeenCalled();
    expect(manager.getHistory()).toEqual([]);
  });

  it('throttles notifications per trigger and item', async () => {
    let now = 1_000;
    const macosSend = vi.fn();
    const telegramSend = vi.fn(async () => true);
    const manager = new NotificationManager({
      macosNotifier: { send: macosSend },
      now: () => now,
      store: createMemoryStore({
        notifications: createNotificationSettings({
          channels: {
            macos: true,
            telegram: true,
          },
          telegramNotifyChatId: 'tg:12345',
        }),
      }),
      telegramNotifier: { send: telegramSend },
    });

    const first = await manager.notify('item_review', {
      body: 'Landing page QA pass',
      itemId: 'item-1',
      title: 'Review ready',
    });
    const second = await manager.notify('item_review', {
      body: 'Landing page QA pass',
      itemId: 'item-1',
      title: 'Review ready',
    });

    now += 10;

    const third = await manager.notify('item_review', {
      body: 'Email flow checklist',
      itemId: 'item-2',
      title: 'Review ready',
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).not.toBeNull();
    expect(macosSend).toHaveBeenCalledTimes(2);
    expect(telegramSend).toHaveBeenCalledTimes(2);
    expect(manager.getHistory().map((record) => record.itemId)).toEqual(['item-2', 'item-1']);
  });

  it('notifies idle agents only once until they become active again', async () => {
    let now = 31 * 60 * 1000;
    let agents = [
      {
        id: 'agent-1',
        name: 'Navigator',
        updatedAt: 0,
      },
    ];
    const macosSend = vi.fn();
    const callbacks: Array<() => void> = [];
    const manager = new NotificationManager({
      getAgents: () => agents,
      macosNotifier: { send: macosSend },
      now: () => now,
      setIntervalFn: (((handler: TimerHandler) => {
        callbacks.push(handler as () => void);
        return 1 as unknown as ReturnType<typeof globalThis.setInterval>;
      }) as unknown) as typeof globalThis.setInterval,
      store: createMemoryStore({
        notifications: createNotificationSettings({
          triggers: { agent_idle: true },
        }),
      }),
    });

    manager.startIdleCheck();
    await vi.waitFor(() => {
      expect(macosSend).toHaveBeenCalledTimes(1);
    });

    callbacks[0]?.();
    await vi.waitFor(() => {
      expect(macosSend).toHaveBeenCalledTimes(1);
    });

    now += 1_000;
    agents = [
      {
        id: 'agent-1',
        name: 'Navigator',
        updatedAt: now,
      },
    ];
    callbacks[0]?.();
    await vi.waitFor(() => {
      expect(macosSend).toHaveBeenCalledTimes(1);
    });

    now += 31 * 60 * 1000;
    agents = [
      {
        id: 'agent-1',
        name: 'Navigator',
        updatedAt: now - 31 * 60 * 1000,
      },
    ];
    callbacks[0]?.();
    await vi.waitFor(() => {
      expect(macosSend).toHaveBeenCalledTimes(2);
    });
  });
});
