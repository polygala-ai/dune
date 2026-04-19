// Notification manager tests.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppStorage } from '@/electron/main/storage';
import type { Agent } from '@/renderer/features/agents/types';

import { NotificationManager } from './notification-manager';
import {
  AGENT_IDLE_POLL_INTERVAL_MS,
  AGENT_IDLE_THRESHOLD_MS,
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationTrigger,
} from './types';

function createMemoryStore(initialValue: unknown = null): AppStorage {
  let value = initialValue;

  return {
    delete: async () => {
      value = null;
    },
    get: async () => value as never,
    keys: async () => (value === null ? [] : ['notifications']),
    set: async (_key, nextValue) => {
      value = nextValue;
    },
  };
}

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    activityEvents: [],
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune Chat',
      status: 'connected',
    },
    codingEngineEvents: [],
    contextCards: [],
    definition: {
      archetype: 'custom',
      responsibilities: [],
    },
    id: 'agent-1',
    lastActiveAt: 0,
    messages: [],
    name: 'Scout',
    note: '',
    preview: 'Scout preview',
    projectId: null,
    status: 'ready',
    telegram: null,
    transcript: {
      archivedMessageCount: 0,
      hasOlderMessages: false,
      rollingSummary: null,
      totalMessageCount: 0,
    },
    updatedAt: 0,
    workspace: '/tmp/scout',
    ...overrides,
  };
}

describe('NotificationManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns default settings when nothing is persisted yet', async () => {
    const manager = new NotificationManager({
      getAgents: () => [],
      macosNotifier: { send: vi.fn(async () => false) } as never,
      settingsStore: createMemoryStore(),
      telegramNotifier: { send: vi.fn(async () => false) } as never,
    });

    await expect(manager.getSettings()).resolves.toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('suppresses delivery during a midnight-crossing do-not-disturb window', async () => {
    let currentTime = new Date(2026, 3, 19, 1, 0, 0).getTime();
    const macosSend = vi.fn(async () => true);
    const manager = new NotificationManager({
      getAgents: () => [],
      macosNotifier: { send: macosSend } as never,
      now: () => currentTime,
      settingsStore: createMemoryStore({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        doNotDisturb: {
          enabled: true,
          endHour: 8,
          startHour: 23,
        },
      }),
      telegramNotifier: { send: vi.fn(async () => false) } as never,
    });

    await expect(manager.notify(NotificationTrigger.item_review, {
      body: 'Ready for review.',
      itemId: 'item-1',
      title: 'Item moved to review',
    })).resolves.toBe(false);

    expect(macosSend).not.toHaveBeenCalled();

    currentTime = new Date(2026, 3, 19, 12, 0, 0).getTime();

    await expect(manager.notify(NotificationTrigger.item_review, {
      body: 'Ready for review.',
      itemId: 'item-1',
      title: 'Item moved to review',
    })).resolves.toBe(true);

    expect(macosSend).toHaveBeenCalledTimes(1);
  });

  it('throttles notifications by trigger and item id while recording delivered history', async () => {
    let currentTime = new Date(2026, 3, 19, 10, 0, 0).getTime();
    const macosSend = vi.fn(async () => true);
    const manager = new NotificationManager({
      getAgents: () => [],
      macosNotifier: { send: macosSend } as never,
      now: () => currentTime,
      settingsStore: createMemoryStore(DEFAULT_NOTIFICATION_SETTINGS),
      telegramNotifier: { send: vi.fn(async () => false) } as never,
    });

    await expect(manager.notify(NotificationTrigger.item_review, {
      body: 'Alpha moved to review.',
      itemId: 'item-alpha',
      title: 'Alpha ready for review',
    })).resolves.toBe(true);

    currentTime += 60_000;

    await expect(manager.notify(NotificationTrigger.item_review, {
      body: 'Alpha moved to review again.',
      itemId: 'item-alpha',
      title: 'Alpha ready for review',
    })).resolves.toBe(false);

    await expect(manager.notify(NotificationTrigger.item_review, {
      body: 'Beta moved to review.',
      itemId: 'item-beta',
      title: 'Beta ready for review',
    })).resolves.toBe(true);

    expect(macosSend).toHaveBeenCalledTimes(2);
    expect(manager.getHistory()).toHaveLength(2);
    expect(manager.getHistory().map((record) => record.itemId)).toEqual([
      'item-beta',
      'item-alpha',
    ]);
  });

  it('polls for idle agents when the trigger is enabled', async () => {
    vi.useFakeTimers();

    let currentTime = new Date(2026, 3, 19, 12, 0, 0).getTime();
    const macosSend = vi.fn(async () => true);
    const agents = [
      createAgent({
        id: 'agent-idle',
        lastActiveAt: currentTime - AGENT_IDLE_THRESHOLD_MS - 1,
        name: 'Idle Scout',
      }),
    ];
    const manager = new NotificationManager({
      getAgents: () => agents,
      macosNotifier: { send: macosSend } as never,
      now: () => currentTime,
      settingsStore: createMemoryStore({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        triggers: {
          ...DEFAULT_NOTIFICATION_SETTINGS.triggers,
          [NotificationTrigger.agent_idle]: true,
        },
      }),
      telegramNotifier: { send: vi.fn(async () => false) } as never,
    });

    await manager.initialize();
    manager.start();

    currentTime += AGENT_IDLE_POLL_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(AGENT_IDLE_POLL_INTERVAL_MS);

    expect(macosSend).toHaveBeenCalledTimes(1);
    expect(macosSend).toHaveBeenCalledWith({
      body: 'Idle Scout has been idle for more than 30 minutes.',
      title: 'Agent idle',
    });

    manager.shutdown();
  });
});
