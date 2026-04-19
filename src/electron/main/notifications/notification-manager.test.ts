// Notification manager tests.

import { describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage';

import { NotificationManager } from './notification-manager';
import {
  createDefaultNotificationSettings,
  NotificationChannel,
  NotificationTrigger,
  type NotificationSettings,
} from './types';

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
    triggers?: Partial<NotificationSettings['triggers']>;
  } = {},
): NotificationSettings {
  const defaults = createDefaultNotificationSettings();

  return {
    triggers: {
      ...defaults.triggers,
      ...(partial.triggers ?? {}),
    },
    channels: {
      ...defaults.channels,
      ...(partial.channels ?? {}),
    },
    doNotDisturb: {
      ...defaults.doNotDisturb,
      ...(partial.doNotDisturb ?? {}),
    },
    telegramNotifyChatId:
      partial.telegramNotifyChatId ?? defaults.telegramNotifyChatId,
  };
}

function flushAsyncWork() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

describe('NotificationManager', () => {
  it('loads defaults and deep-merges settings updates', async () => {
    const manager = new NotificationManager({
      store: createMemoryStore(),
    });

    expect(await manager.getSettings()).toEqual(createNotificationSettings());

    const nextSettings = await manager.updateSettings({
      channels: { [NotificationChannel.Telegram]: true },
      doNotDisturb: { enabled: true, startHour: 21 },
      telegramNotifyChatId: 'tg:12345',
      triggers: { [NotificationTrigger.AgentIdle]: true },
    });

    expect(nextSettings).toEqual(createNotificationSettings({
      channels: { [NotificationChannel.Telegram]: true },
      doNotDisturb: { enabled: true, startHour: 21 },
      telegramNotifyChatId: 'tg:12345',
      triggers: { [NotificationTrigger.AgentIdle]: true },
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
            startHour: 23,
            endHour: 8,
          },
        }),
      }),
    });

    const notification = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Landing page QA pass',
      itemId: 'item-1',
    });

    expect(notification).toBeNull();
    expect(macosSend).not.toHaveBeenCalled();
    expect(manager.getHistory()).toEqual([]);
  });

  it('throttles notifications per trigger and item and records one entry per channel', async () => {
    let now = 1_000;
    const macosSend = vi.fn(() => true);
    const telegramSend = vi.fn(async () => true);
    const manager = new NotificationManager({
      macosNotifier: { send: macosSend },
      telegramNotifier: { send: telegramSend },
      now: () => now,
      store: createMemoryStore({
        notifications: createNotificationSettings({
          channels: {
            [NotificationChannel.MacOS]: true,
            [NotificationChannel.Telegram]: true,
          },
          telegramNotifyChatId: 'tg:12345',
        }),
      }),
    });

    const first = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Landing page QA pass',
      itemId: 'item-1',
    });
    const second = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Landing page QA pass',
      itemId: 'item-1',
    });

    now += 10;

    const third = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Email flow checklist',
      itemId: 'item-2',
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).not.toBeNull();
    expect(macosSend).toHaveBeenCalledTimes(2);
    expect(telegramSend).toHaveBeenCalledTimes(2);
    expect(
      manager.getHistory().map((record) => `${record.itemId}:${record.channel}`),
    ).toEqual([
      `item-2:${NotificationChannel.MacOS}`,
      `item-2:${NotificationChannel.Telegram}`,
      `item-1:${NotificationChannel.MacOS}`,
      `item-1:${NotificationChannel.Telegram}`,
    ]);
  });

  it('does not throttle or record history when no channel actually delivers', async () => {
    const manager = new NotificationManager({
      macosNotifier: { send: () => false },
      telegramNotifier: { send: async () => false },
      store: createMemoryStore({
        notifications: createNotificationSettings({
          channels: {
            [NotificationChannel.MacOS]: true,
            [NotificationChannel.Telegram]: true,
          },
          telegramNotifyChatId: 'tg:12345',
        }),
      }),
    });

    const first = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Landing page QA pass',
      itemId: 'item-1',
    });
    const second = await manager.notify(NotificationTrigger.ItemReview, {
      title: 'Review ready',
      body: 'Landing page QA pass',
      itemId: 'item-1',
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(manager.getHistory()).toEqual([]);
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
    const macosSend = vi.fn(() => true);
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
          triggers: { [NotificationTrigger.AgentIdle]: true },
        }),
      }),
    });

    await manager.getSettings();
    manager.startIdleCheck();
    await flushAsyncWork();

    expect(macosSend).toHaveBeenCalledTimes(1);

    callbacks[0]!();
    await flushAsyncWork();

    expect(macosSend).toHaveBeenCalledTimes(1);

    now += 1_000;
    agents = [
      {
        id: 'agent-1',
        name: 'Navigator',
        updatedAt: now,
      },
    ];
    callbacks[0]!();
    await flushAsyncWork();

    now += 31 * 60 * 1000;
    agents = [
      {
        id: 'agent-1',
        name: 'Navigator',
        updatedAt: now - (31 * 60 * 1000),
      },
    ];
    callbacks[0]!();
    await flushAsyncWork();

    expect(macosSend).toHaveBeenCalledTimes(2);
  });
});
