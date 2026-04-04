import { describe, expect, it, vi } from 'vitest';

import {
  ManagedTelegramChannel,
  type ManagedTelegramChannelHooks,
} from '@/electron/runtime-core/managed-telegram-channel';

function createHooks(): ManagedTelegramChannelHooks {
  return {
    onChatMetadata: vi.fn(),
    onInboundMessage: vi.fn(),
    onOutboundMessage: vi.fn(),
  };
}

describe('ManagedTelegramChannel', () => {
  it('captures the connected Telegram bot username after connect', async () => {
    let connected = false;
    const channel = new ManagedTelegramChannel(createHooks(), {
      createChannel: () => ({
        _setOpts: vi.fn(),
        connect: vi.fn(async () => {
          connected = true;
        }),
        disconnect: vi.fn(async () => {
          connected = false;
        }),
        getBotUsername: () => 'agentlite_test_bot',
        isConnected: () => connected,
        sendMessage: vi.fn(),
      }),
    });

    await channel.reconfigure('telegram-token');

    expect(channel.getBotUsername()).toBe('agentlite_test_bot');
  });

  it('suppresses worker-exited logger failures during disconnect and clears local state', async () => {
    let connected = false;
    const connect = vi.fn(async () => {
      connected = true;
    });
    const disconnect = vi.fn(async () => {
      connected = false;
      throw new Error('the worker has exited');
    });
    const setOpts = vi.fn();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const channel = new ManagedTelegramChannel(createHooks(), {
      createChannel: () => ({
        _setOpts: setOpts,
        connect,
        disconnect,
        isConnected: () => connected,
        sendMessage: vi.fn(),
      }),
    });

    await channel.reconfigure('telegram-token');
    await expect(channel.reconfigure(null)).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(channel.getBotUsername()).toBeNull();
    expect(channel.isConnected()).toBe(false);
  });

  it('rethrows unrelated disconnect failures during live reconfigure', async () => {
    let connected = false;
    const disconnect = vi.fn(async () => {
      throw new Error('socket broke');
    });
    const channel = new ManagedTelegramChannel(createHooks(), {
      createChannel: () => ({
        _setOpts: vi.fn(),
        connect: vi.fn(async () => {
          connected = true;
        }),
        disconnect,
        isConnected: () => connected,
        sendMessage: vi.fn(),
      }),
    });

    await channel.reconfigure('token-1');

    await expect(channel.reconfigure('token-2')).rejects.toThrow('socket broke');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(channel.isConnected()).toBe(true);
  });

  it('times out Telegram connect attempts and clears local state', async () => {
    vi.useFakeTimers();
    let connected = false;
    const disconnect = vi.fn(async () => {
      connected = false;
    });
    const channel = new ManagedTelegramChannel(createHooks(), {
      connectTimeoutMs: 1_000,
      createChannel: () => ({
        _setOpts: vi.fn(),
        connect: vi.fn(() => new Promise<void>(() => undefined)),
        disconnect,
        isConnected: () => connected,
        sendMessage: vi.fn(),
      }),
    });

    const connectPromise = expect(channel.reconfigure('token-1')).rejects.toThrow(
      'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await connectPromise;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(channel.getBotUsername()).toBeNull();
    expect(channel.isConnected()).toBe(false);

    vi.useRealTimers();
  });
});
