import type { ChannelOpts } from '@boxlite-ai/agentlite';
import { describe, expect, it, vi } from 'vitest';

import { SwappableChannelProxy } from '@/electron/runtime-core/swappable-channel-proxy';

function createChannelOptions(): ChannelOpts {
  return {
    onChatMetadata: vi.fn(),
    onMessage: vi.fn(),
    registeredGroups: () => ({}),
  };
}

describe('SwappableChannelProxy', () => {
  it('captures the connected identity after connect', async () => {
    let connected = false;
    const channel = new SwappableChannelProxy<string>({
      channelOptions: createChannelOptions(),
      createChannel: () => ({
        connect: vi.fn(async () => {
          connected = true;
        }),
        disconnect: vi.fn(async () => {
          connected = false;
        }),
        getBotUsername: () => 'agentlite_test_bot',
        isConnected: () => connected,
        name: 'telegram',
        ownsJid: (jid: string) => jid.startsWith('tg:'),
        sendMessage: vi.fn(),
      }),
      name: 'telegram',
      onOutboundMessage: vi.fn(),
      ownsJid: (jid) => jid.startsWith('tg:'),
      readIdentity: (innerChannel) => (
        innerChannel as { getBotUsername?: () => string | null } | null
      )?.getBotUsername?.() ?? null,
      timeoutMessage:
        'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    });

    await channel.configure('telegram-token');

    expect(channel.getIdentity()).toBe('agentlite_test_bot');
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
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const channel = new SwappableChannelProxy<string>({
      channelOptions: createChannelOptions(),
      createChannel: () => ({
        connect,
        disconnect,
        isConnected: () => connected,
        name: 'telegram',
        ownsJid: (jid: string) => jid.startsWith('tg:'),
        sendMessage: vi.fn(),
      }),
      name: 'telegram',
      onOutboundMessage: vi.fn(),
      ownsJid: (jid) => jid.startsWith('tg:'),
      timeoutMessage:
        'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    });

    await channel.configure('telegram-token');
    await expect(channel.configure(null)).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(channel.getIdentity()).toBeNull();
    expect(channel.isConnected()).toBe(false);
  });

  it('rethrows unrelated disconnect failures during live reconfigure', async () => {
    let connected = false;
    const disconnect = vi.fn(async () => {
      throw new Error('socket broke');
    });
    const channel = new SwappableChannelProxy<string>({
      channelOptions: createChannelOptions(),
      createChannel: () => ({
        connect: vi.fn(async () => {
          connected = true;
        }),
        disconnect,
        isConnected: () => connected,
        name: 'telegram',
        ownsJid: (jid: string) => jid.startsWith('tg:'),
        sendMessage: vi.fn(),
      }),
      name: 'telegram',
      onOutboundMessage: vi.fn(),
      ownsJid: (jid) => jid.startsWith('tg:'),
      timeoutMessage:
        'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    });

    await channel.configure('token-1');

    await expect(channel.configure('token-2')).rejects.toThrow('socket broke');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(channel.isConnected()).toBe(true);
  });

  it('times out connect attempts and clears local state', async () => {
    vi.useFakeTimers();
    let connected = false;
    const disconnect = vi.fn(async () => {
      connected = false;
    });
    const channel = new SwappableChannelProxy<string>({
      channelOptions: createChannelOptions(),
      connectTimeoutMs: 1_000,
      createChannel: () => ({
        connect: vi.fn(() => new Promise<void>(() => undefined)),
        disconnect,
        isConnected: () => connected,
        name: 'telegram',
        ownsJid: (jid: string) => jid.startsWith('tg:'),
        sendMessage: vi.fn(),
      }),
      name: 'telegram',
      onOutboundMessage: vi.fn(),
      ownsJid: (jid) => jid.startsWith('tg:'),
      timeoutMessage:
        'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    });

    const connectPromise = expect(channel.configure('token-1')).rejects.toThrow(
      'Telegram failed to connect within 1s. Check the Network settings or proxy configuration.',
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await connectPromise;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(channel.getIdentity()).toBeNull();
    expect(channel.isConnected()).toBe(false);

    vi.useRealTimers();
  });
});
