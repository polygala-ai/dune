// Telegram bridge tests.

import type {
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/renderer/features/agents/types';
import { TelegramBridge } from './telegram-bridge';

/** Creates deferred. */
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

/** Flushes microtasks. */
async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

/** Creates memory secrets store. */
function createMemorySecretsStore() {
  const data = new Map<string, unknown>();

  return {
    delete: async (key: string) => {
      data.delete(key);
    },
    get: async <T,>(key: string) => (data.get(key) as T) ?? null,
    set: async <T,>(key: string, value: T) => {
      data.set(key, value);
    },
  };
}

/** Creates Telegram observer harness. */
function createTelegramObserverHarness(
  options: {
    connect?: () => Promise<void> | void;
    disconnect?: () => Promise<void> | void;
  } = {},
) {
  interface ObserverState {
    config: ChannelDriverConfig;
    connected: boolean;
    id: string;
  }

  let nextObserverId = 0;
  const observerStatesByToken = new Map<string, ObserverState[]>();
  const connect = vi.fn(async () => {
    await options.connect?.();
  });
  const disconnect = vi.fn(async () => {
    await options.disconnect?.();
  });

  return {
    connect,
    connectedObserverCount: (token: string) =>
      (observerStatesByToken.get(token) ?? []).filter((state) => state.connected).length,
    createChannelFactory: async (token: string): Promise<ChannelDriverFactory> =>
      (config: ChannelDriverConfig) => {
        const states = observerStatesByToken.get(token) ?? [];
        const state: ObserverState = {
          config,
          connected: false,
          id: `observer-${nextObserverId += 1}`,
        };

        states.push(state);
        observerStatesByToken.set(token, states);

        const channel: ChannelDriver = {
          connect: async () => {
            await connect();
            state.connected = true;
          },
          disconnect: async () => {
            await disconnect();
            state.connected = false;
          },
          isConnected: vi.fn(() => state.connected),
          ownsJid: (jid: string) => jid.startsWith('tg:'),
          sendMessage: vi.fn(async () => undefined),
        };

        return channel;
      },
    disconnect,
    latestObserverId: (token: string) =>
      observerStatesByToken.get(token)?.at(-1)?.id ?? null,
  };
}

/** Creates test bridge. */
function createBridge(
  harness: ReturnType<typeof createTelegramObserverHarness>,
) {
  return new TelegramBridge({
    callbacks: {
      getAgents: () => [] as Agent[],
      now: () => Date.now(),
      onChange: vi.fn(),
    },
    createChannelFactory: harness.createChannelFactory,
    resolveBotUsername: async () => 'agentlite_test_bot',
    secretsStore: createMemorySecretsStore(),
  });
}

describe('TelegramBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('replaces an existing observer for the same token fingerprint without stacking a second one', async () => {
    const harness = createTelegramObserverHarness();
    const bridge = createBridge(harness);

    await bridge.startSetupSession({ token: 'shared-token' });
    const firstObserverId = harness.latestObserverId('shared-token');

    expect(firstObserverId).toBeTruthy();
    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.connectedObserverCount('shared-token')).toBe(1);

    await bridge.refreshRuntimeState({ forceReconnect: true });

    expect(harness.latestObserverId('shared-token')).not.toBe(firstObserverId);
    expect(harness.connect).toHaveBeenCalledTimes(2);
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.connectedObserverCount('shared-token')).toBe(1);

    bridge.clearAllSetupSessions();
    await bridge.disconnectAll();
  });

  it('dedupes concurrent observer creation for the same token fingerprint', async () => {
    vi.useFakeTimers();

    const firstConnectStarted = createDeferred<void>();
    const allowConnect = createDeferred<void>();
    let connectCount = 0;
    const harness = createTelegramObserverHarness({
      connect: async () => {
        connectCount += 1;

        if (connectCount === 1) {
          firstConnectStarted.resolve();
          await allowConnect.promise;
        }
      },
    });
    const bridge = createBridge(harness);

    const firstSession = bridge.startSetupSession({ token: 'shared-token' });
    await firstConnectStarted.promise;

    const secondSession = bridge.startSetupSession({ token: 'shared-token' });
    await flushMicrotasks();

    expect(harness.connect).toHaveBeenCalledTimes(1);

    allowConnect.resolve();
    await Promise.all([firstSession, secondSession]);

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.connectedObserverCount('shared-token')).toBe(1);

    bridge.clearAllSetupSessions();
    await bridge.disconnectAll();
  });

  it('clears the disconnectAll guard after reconnecting the same bridge', async () => {
    const harness = createTelegramObserverHarness();
    const bridge = createBridge(harness);

    await bridge.startSetupSession({ token: 'shared-token' });

    expect(harness.connectedObserverCount('shared-token')).toBe(1);

    await bridge.disconnectAll();

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.connectedObserverCount('shared-token')).toBe(0);

    await bridge.refreshRuntimeState();

    expect(harness.connect).toHaveBeenCalledTimes(2);
    expect(harness.connectedObserverCount('shared-token')).toBe(1);

    await bridge.disconnectAll();

    expect(harness.disconnect).toHaveBeenCalledTimes(2);
    expect(harness.connectedObserverCount('shared-token')).toBe(0);

    bridge.clearAllSetupSessions();
  });
});
