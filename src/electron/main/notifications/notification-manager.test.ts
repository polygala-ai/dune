// Notification manager tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import type { AppStorage } from '@/electron/main/storage';

import { NotificationManager } from './notification-manager';
import {
  NotificationTrigger,
  type NotificationSettingsUpdate,
} from './types';

class MemoryStore implements AppStorage {
  readonly values = new Map<string, unknown>();

  delete(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.values.get(key) as T | undefined) ?? null);
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.values.keys()]);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function createSnapshot(
  overrides?: Partial<AgentServiceSnapshot>,
): AgentServiceSnapshot {
  return {
    agents: [],
    codingEngines: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
    ...overrides,
  };
}

describe('NotificationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throttles repeated item notifications and records history', async () => {
    const store = new MemoryStore();
    const sendMacos = vi.fn();
    let now = 1_000;
    const manager = new NotificationManager({
      getRuntimeSnapshot: () => createSnapshot(),
      now: () => now,
      sendMacos,
      settingsStore: store,
    });

    await manager.ready();
    manager.notify(NotificationTrigger.item_review, {
      body: 'Write launch copy',
      itemId: 'item-1',
      title: 'Item moved to review',
    });

    await Promise.resolve();
    expect(sendMacos).toHaveBeenCalledTimes(1);
    expect(manager.getHistory()).toHaveLength(1);

    manager.notify(NotificationTrigger.item_review, {
      body: 'Write launch copy',
      itemId: 'item-1',
      title: 'Item moved to review',
    });

    await Promise.resolve();
    expect(sendMacos).toHaveBeenCalledTimes(1);

    now += 5 * 60 * 1000 + 1;
    manager.notify(NotificationTrigger.item_review, {
      body: 'Write launch copy',
      itemId: 'item-1',
      title: 'Item moved to review',
    });

    await Promise.resolve();
    expect(sendMacos).toHaveBeenCalledTimes(2);
    expect(manager.getHistory()).toHaveLength(2);
    manager.dispose();
  });

  it('suppresses delivery inside do-not-disturb hours that cross midnight', async () => {
    const store = new MemoryStore();
    const sendMacos = vi.fn();
    const now = new Date('2026-04-19T23:30:00+08:00').getTime();
    const manager = new NotificationManager({
      getRuntimeSnapshot: () => createSnapshot(),
      now: () => now,
      sendMacos,
      settingsStore: store,
    });

    await manager.ready();
    manager.updateSettings({
      doNotDisturb: {
        enabled: true,
        endHour: 8,
        startHour: 23,
      },
    } satisfies NotificationSettingsUpdate);

    manager.notify(NotificationTrigger.agent_error, {
      agentId: 'agent-1',
      body: 'The scheduled task failed.',
      title: 'Agent error',
    });

    await Promise.resolve();
    expect(sendMacos).not.toHaveBeenCalled();
    expect(manager.getHistory()).toHaveLength(0);
    manager.dispose();
  });

  it('checks ready agents for 30-minute idle windows', async () => {
    const store = new MemoryStore();
    const sendMacos = vi.fn();
    const now = Date.now();
    const manager = new NotificationManager({
      getRuntimeSnapshot: () => createSnapshot({
        agents: [
          {
            activityEvents: [],
            channel: {
              id: 'dune-chat',
              label: 'Dune Chat',
              status: 'ready',
            },
            codingEngineEvents: [],
            contextCards: [],
            definition: {
              archetype: 'general',
              customInstructions: '',
              modelProviderId: null,
              responsibilities: '',
            },
            id: 'agent-1',
            messages: [],
            name: 'Navigator',
            note: '',
            preview: 'Ready for a first instruction.',
            projectId: null,
            status: 'ready',
            telegram: null,
            transcript: {
              hasOlderMessages: false,
              latestMessageId: null,
              totalCount: 0,
            },
            updatedAt: now - (31 * 60 * 1000),
            workspace: '/tmp/agent-1',
          } as unknown as AgentServiceSnapshot['agents'][number],
        ],
      }),
      now: () => now,
      sendMacos,
      settingsStore: store,
    });

    await manager.ready();
    manager.updateSettings({
      triggers: {
        [NotificationTrigger.agent_idle]: true,
      },
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(sendMacos).toHaveBeenCalledWith(
      'Agent idle',
      'Navigator has been idle for 31 minutes.',
    );
    manager.dispose();
  });
});
