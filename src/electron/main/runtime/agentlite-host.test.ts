import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Channel,
  ChannelHandler,
  ChannelOpts,
  GroupOptions,
  RegisteredGroup,
} from '@boxlite-ai/agentlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
  type AgentStore,
} from '@/electron/runtime-core/agentlite-host';

type AgentLiteModule = typeof import('@boxlite-ai/agentlite');
type AgentLiteOptions = ConstructorParameters<AgentLiteModule['AgentLite']>[0];

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agentlite-home-'));
}

function createMemoryStore(): AgentStore {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (data.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      data.set(key, value);
    },
  };
}

function createRegisteredGroup(options: GroupOptions): RegisteredGroup {
  const folder =
    options.folder ??
    options.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return {
    added_at: new Date('2026-04-04T00:00:00.000Z').toISOString(),
    folder,
    name: options.name,
    trigger: options.trigger ?? '@Dune',
    ...(options.containerConfig ? { containerConfig: options.containerConfig } : {}),
    ...(options.isMain !== undefined ? { isMain: options.isMain } : {}),
    ...(options.requiresTrigger !== undefined
      ? { requiresTrigger: options.requiresTrigger }
      : {}),
  };
}

function createAgentLiteModuleHarness() {
  const channels = new Map<string, Channel>();
  const registeredGroups: Record<string, RegisteredGroup> = {};
  const registerGroup = vi.fn((jid: string, options: GroupOptions) => {
    registeredGroups[jid] = createRegisteredGroup(options);
  });
  const registerChannelFactory = vi.fn(async (name: string, factory: (opts: ChannelOpts) => Channel | null) => {
    const builtin: ChannelHandler = {
      onChatMetadata: vi.fn(),
      onMessage: vi.fn(),
      registeredGroups: () => registeredGroups,
    };
    const handler = capturedOptions?.channelHandler
      ? capturedOptions.channelHandler(builtin)
      : builtin;
    const channel = factory(handler);

    if (!channel) {
      return false;
    }

    channels.set(name, channel);
    await channel.connect();
    return true;
  });
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn(async () => {
    for (const channel of channels.values()) {
      await channel.disconnect();
    }
  });
  let capturedOptions: AgentLiteOptions | null = null;

  return {
    capturedOptions: () => capturedOptions,
    channel: (name: string) => {
      const channel = channels.get(name);

      if (!channel) {
        throw new Error(`Channel "${name}" was not registered.`);
      }

      return channel;
    },
    loadAgentLiteModule: (async () =>
      ({
        AgentLite: class {
          constructor(options?: AgentLiteOptions) {
            capturedOptions = options ?? null;
          }

          registerChannelFactory = registerChannelFactory;
          registerGroup = registerGroup;
          start = start;
          stop = stop;
        },
      }) as unknown as AgentLiteModule),
    registerChannelFactory,
    registerGroup,
    start,
    stop,
  };
}

function createTelegramChannelHarness(
  options: {
    botUsername?: string | null;
    connect?: (token: string | null) => Promise<void> | void;
    disconnect?: () => Promise<void> | void;
    isConnected?: () => boolean;
    sendMessage?: (jid: string, text: string) => Promise<void> | void;
  } = {},
) {
  let connected = false;
  let currentToken: string | null = null;
  let channelOptions: ChannelOpts | null = null;
  const connect = vi.fn(async () => {
    if (options.connect) {
      await options.connect(currentToken);
      return;
    }

    connected = true;
  });
  const disconnect = vi.fn(async () => {
    if (options.disconnect) {
      await options.disconnect();
      return;
    }

    connected = false;
  });
  const sendMessage = vi.fn(async (jid: string, text: string) => {
    await options.sendMessage?.(jid, text);
  });
  const channel = {
    connect,
    disconnect,
    getBotUsername: vi.fn(() => options.botUsername ?? null),
    isConnected: vi.fn(() => (options.isConnected ? options.isConnected() : connected)),
    name: 'telegram',
    ownsJid: (jid: string) => jid.startsWith('tg:'),
    sendMessage,
    setTyping: vi.fn(async () => undefined),
  } satisfies Channel & { getBotUsername: () => string | null };

  return {
    channel,
    channelOptions: () => {
      if (!channelOptions) {
        throw new Error('Telegram channel options were not captured.');
      }

      return channelOptions;
    },
    connect,
    createTelegramChannel: async (token: string, nextChannelOptions: ChannelOpts) => {
      currentToken = token;
      channelOptions = nextChannelOptions;
      return channel;
    },
    disconnect,
    lastToken: () => currentToken,
    sendMessage,
  };
}

describe('AgentLiteHost', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('uses ~/.dune/agentlite as the runtime root and starts AgentLite with saved oauth-token credentials', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    let credentials: Record<string, string> = {
      CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
    };

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => credentials,
    });

    await host.start();

    const runtimeRoot = resolveAgentLiteRuntimeRoot(homeDir);
    const capturedOptions = harness.capturedOptions();

    expect(capturedOptions?.workdir).toBe(runtimeRoot);
    expect(capturedOptions?.name).toBe('Dune');
    await expect(capturedOptions?.model?.credentials?.()).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
    });
    credentials = {
      CLAUDE_CODE_OAUTH_TOKEN: 'updated-oauth-token',
    };
    await expect(capturedOptions?.model?.credentials?.()).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
    });
    expect(host.getSnapshot().runtimeInfo).toEqual({
      message: 'AgentLite is running with saved model credentials.',
      mode: 'real',
      rootPath: runtimeRoot,
      status: 'ready',
    });
    expect(harness.start).toHaveBeenCalledTimes(1);
    expect(harness.registerChannelFactory.mock.calls.map(([name]) => name)).toEqual([
      'dune',
      'telegram',
    ]);
    expect(harness.registerGroup).toHaveBeenCalledWith(
      'dune:main',
      expect.objectContaining({
        folder: 'main',
        isMain: true,
        name: 'Dune Control',
        requiresTrigger: false,
      }),
    );

    await host.shutdown();

    expect(harness.stop).toHaveBeenCalledTimes(1);
  });

  it('passes saved api-key credentials through to AgentLite', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        ANTHROPIC_BASE_URL: 'https://compatible.example/v1',
      }),
    });

    await host.start();

    await expect(harness.capturedOptions()?.model?.credentials?.()).resolves.toEqual({
      ANTHROPIC_BASE_URL: 'https://compatible.example/v1',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
    });
    expect(host.getSnapshot().runtimeInfo.message).toBe(
      'AgentLite is running with saved model credentials.',
    );
  });

  it('starts without saved credentials and reports that replies will fail', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();

    await expect(harness.capturedOptions()?.model?.credentials?.()).resolves.toEqual({});
    expect(host.getSnapshot().runtimeInfo.message).toBe(
      'AgentLite is running without saved model credentials; replies will fail.',
    );
  });

  it('reloads Telegram configuration immediately and mirrors Telegram traffic into the agent transcript', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelHarness({
      botUsername: 'agentlite_test_bot',
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });

    await host.start();

    expect(telegramHarness.lastToken()).toBe('telegram-bot-token');
    expect(host.getSnapshot().externalChannels.telegram).toMatchObject({
      botUsername: 'agentlite_test_bot',
      configured: true,
      errorMessage: null,
      status: 'connected',
    });

    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();
    telegramHarness.channelOptions().onChatMetadata('tg:123', timestamp, 'Product QA', 'telegram', true);

    expect(host.getSnapshot().externalChannels.telegram.discoveredChats).toEqual([
      {
        channelId: 'telegram',
        jid: 'tg:123',
        kind: 'group',
        lastSeenAt: Date.parse(timestamp),
        name: 'Product QA',
      },
    ]);

    const agentId = await host.service.createAgent({
      channelId: 'telegram',
      externalTarget: {
        channelId: 'telegram',
        jid: 'tg:123',
        kind: 'group',
        name: 'Product QA',
      },
      name: 'Release triage',
    });

    telegramHarness.channelOptions().onMessage('tg:123', {
      chat_jid: 'tg:123',
      content: 'Build is red',
      id: 'message-1',
      is_from_me: false,
      sender: 'user-1',
      sender_name: 'Alice',
      timestamp,
    });
    await harness.channel('telegram').sendMessage('tg:123', 'Investigating now.');

    const snapshot = host.getSnapshot();
    const telegramAgent = snapshot.agents.find((agent) => agent.id === agentId);

    expect(telegramAgent?.channel.target).toEqual({
      channelId: 'telegram',
      jid: 'tg:123',
      kind: 'group',
      name: 'Product QA',
    });
    expect(telegramAgent?.messages.map((message) => message.content)).toEqual([
      'Alice: Build is red',
      'Investigating now.',
    ]);
    expect(telegramAgent?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('surfaces Telegram connection errors and disconnects cleanly when the token is removed', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const store = createMemoryStore();
    let token = 'bad-token';
    const telegramHarness = createTelegramChannelHarness({
      connect: async (nextToken) => {
        if (nextToken === 'bad-token') {
          throw new Error('Telegram rejected the token');
        }
      },
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: store,
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => token,
    });

    await host.start();

    expect(host.getSnapshot().externalChannels.telegram).toMatchObject({
      botUsername: null,
      configured: true,
      status: 'error',
    });
    expect(host.getSnapshot().externalChannels.telegram.errorMessage).toContain(
      'Telegram rejected the token',
    );

    token = '';
    await host.reloadExternalChannels();

    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(1);
    expect(host.getSnapshot().externalChannels.telegram).toEqual({
      botUsername: null,
      configured: false,
      discoveredChats: [],
      errorMessage: null,
      status: 'not-configured',
    });
    expect(await store.get('telegramTokenFingerprint')).toBeNull();
  });

  it('surfaces Telegram connect timeouts without leaving startup hung', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelHarness({
      connect: async () => new Promise<void>(() => undefined),
    });
    vi.useFakeTimers();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });

    const startPromise = host.start();
    await vi.advanceTimersByTimeAsync(15_000);
    await startPromise;

    expect(host.getSnapshot().externalChannels.telegram).toMatchObject({
      configured: true,
      status: 'error',
      errorMessage:
        'Telegram failed to connect within 15s. Check the Network settings or proxy configuration.',
    });
  });

  it('preserves discovered Telegram chats across restart when the token fingerprint is unchanged', async () => {
    const homeDir = createTempHome();
    const store = createMemoryStore();
    const firstHarness = createAgentLiteModuleHarness();
    const firstTelegramHarness = createTelegramChannelHarness({
      botUsername: 'agentlite_test_bot',
    });
    const secondHarness = createAgentLiteModuleHarness();
    const secondTelegramHarness = createTelegramChannelHarness({
      botUsername: 'agentlite_test_bot',
    });
    const token = 'telegram-bot-token';

    tempDirs.push(homeDir);

    const firstHost = new AgentLiteHost({
      agentStore: store,
      createTelegramChannel: firstTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: firstHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => token,
    });

    await firstHost.start();

    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();
    firstTelegramHarness.channelOptions().onChatMetadata('tg:123', timestamp, 'HashG', 'telegram', false);

    expect(firstHost.getSnapshot().externalChannels.telegram.discoveredChats).toEqual([
      {
        channelId: 'telegram',
        jid: 'tg:123',
        kind: 'dm',
        lastSeenAt: Date.parse(timestamp),
        name: 'HashG',
      },
    ]);

    await firstHost.shutdown();

    const restartedHost = new AgentLiteHost({
      agentStore: store,
      createTelegramChannel: secondTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: secondHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => token,
    });

    await restartedHost.start();

    expect(restartedHost.getSnapshot().externalChannels.telegram).toMatchObject({
      botUsername: 'agentlite_test_bot',
      configured: true,
      discoveredChats: [
        {
          channelId: 'telegram',
          jid: 'tg:123',
          kind: 'dm',
          lastSeenAt: Date.parse(timestamp),
          name: 'HashG',
        },
      ],
      status: 'connected',
    });
    expect(await store.get('telegramTokenFingerprint')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('clears discovered Telegram chats across restart when the token fingerprint changes', async () => {
    const homeDir = createTempHome();
    const store = createMemoryStore();
    const firstHarness = createAgentLiteModuleHarness();
    const firstTelegramHarness = createTelegramChannelHarness({
      botUsername: 'first_bot',
    });
    const secondHarness = createAgentLiteModuleHarness();
    const secondTelegramHarness = createTelegramChannelHarness({
      botUsername: 'second_bot',
    });

    tempDirs.push(homeDir);

    const firstHost = new AgentLiteHost({
      agentStore: store,
      createTelegramChannel: firstTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: firstHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'first-token',
    });

    await firstHost.start();

    firstTelegramHarness.channelOptions().onChatMetadata(
      'tg:123',
      new Date('2026-04-04T01:00:00.000Z').toISOString(),
      'HashG',
      'telegram',
      false,
    );
    await firstHost.shutdown();

    const restartedHost = new AgentLiteHost({
      agentStore: store,
      createTelegramChannel: secondTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: secondHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'second-token',
    });

    await restartedHost.start();

    expect(restartedHost.getSnapshot().externalChannels.telegram).toEqual({
      botUsername: 'second_bot',
      configured: true,
      discoveredChats: [],
      errorMessage: null,
      status: 'connected',
    });
    const externalChannels = await store.get<{ telegram?: { discoveredChats?: unknown[] } }>('externalChannels');
    expect(externalChannels?.telegram?.discoveredChats).toEqual([]);
  });

  it('shuts down cleanly and clears the Telegram proxy after AgentLite stops', async () => {
    const homeDir = createTempHome();
    let connected = false;
    const telegramHarness = createTelegramChannelHarness({
      botUsername: 'agentlite_test_bot',
      connect: async () => {
        connected = true;
      },
      disconnect: async () => {
        connected = false;
        throw new Error('the worker has exited');
      },
      isConnected: () => connected,
    });
    const harness = createAgentLiteModuleHarness();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });

    await host.start();
    await expect(host.shutdown()).resolves.toBeUndefined();

    expect(harness.stop).toHaveBeenCalledTimes(1);
    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(1);
    expect(telegramHarness.connect).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(harness.channel('telegram').isConnected()).toBe(false);
  });
});
