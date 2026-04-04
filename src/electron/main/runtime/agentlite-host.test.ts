import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
} from '@/electron/runtime-core/agentlite-host';
import {
  ManagedTelegramChannel,
  type ManagedTelegramChannelHooks,
  type RuntimeTelegramChannel,
} from '@/electron/runtime-core/managed-telegram-channel';

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agentlite-home-'));
}

function readPersistedRuntimeState(homeDir: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(resolveAgentLiteRuntimeRoot(homeDir), 'data', 'dune-runtime-state.json'),
      'utf-8',
    ),
  ) as {
    externalChannels?: {
      telegram?: {
        botUsername?: string | null;
        configured?: boolean;
        discoveredChats?: Array<{
          channelId: string;
          jid: string;
          kind: string;
          lastSeenAt: number;
          name: string;
        }>;
        errorMessage?: string | null;
        status?: string;
      };
    };
    telegramTokenFingerprint?: string | null;
  };
}

function createAgentLiteModuleHarness() {
  const registerGroup = vi.fn();
  const registerChannel = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  let capturedOptions: {
    model?: {
      credentials?: () => Promise<Record<string, string>>;
    };
    name?: string;
    workdir?: string;
  } | null = null;

  return {
    capturedOptions: () => capturedOptions,
    loadAgentLiteModule: async () => ({
      AgentLite: class {
        constructor(options?: {
          llm?: {
            credentials?: () => Promise<Record<string, string>>;
          };
          name?: string;
          workdir?: string;
        }) {
          capturedOptions = options ?? null;
        }

        registerChannel = registerChannel;
        registerGroup = registerGroup;
        start = start;
        stop = stop;
      },
    }),
    registerChannel,
    registerGroup,
    start,
    stop,
  };
}

function createTelegramChannelHarness(
  options: {
    botUsername?: string | null;
    reconfigure?: (token: string | null) => Promise<void>;
  } = {},
) {
  let connected = false;
  const connect = vi.fn(async () => {
    connected = true;
  });
  const disconnect = vi.fn(async () => {
    connected = false;
  });
  const isConnected = vi.fn(() => connected);
  const reconfigure = vi.fn(options.reconfigure ?? (async () => undefined));
  const sendMessage = vi.fn();
  const channel = {
    connect,
    disconnect,
    getBotUsername: vi.fn(() => options.botUsername ?? null),
    isConnected,
    name: 'telegram',
    ownsJid: (jid: string) => jid.startsWith('tg:'),
    reconfigure,
    reset: vi.fn(),
    sendMessage,
    setTyping: vi.fn(),
  };
  let hooks: ManagedTelegramChannelHooks | null = null;

  return {
    channel,
    connect,
    createTelegramChannel: (nextHooks: ManagedTelegramChannelHooks) => {
      hooks = nextHooks;
      return channel;
    },
    hooks: () => {
      if (!hooks) {
        throw new Error('Telegram hooks were not captured.');
      }

      return hooks;
    },
    reconfigure,
    reset: channel.reset,
  };
}

describe('AgentLiteHost', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();

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
    expect(harness.registerChannel).toHaveBeenCalledTimes(2);
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
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });

    await host.start();

    expect(telegramHarness.reconfigure).toHaveBeenCalledWith('telegram-bot-token');
    expect(host.getSnapshot().externalChannels.telegram).toMatchObject({
      botUsername: 'agentlite_test_bot',
      configured: true,
      errorMessage: null,
      status: 'connected',
    });

    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();
    telegramHarness.hooks().onChatMetadata('tg:123', timestamp, 'Product QA', 'telegram', true);

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

    telegramHarness.hooks().onInboundMessage('tg:123', {
      chat_jid: 'tg:123',
      content: 'Build is red',
      id: 'message-1',
      is_from_me: false,
      sender: 'user-1',
      sender_name: 'Alice',
      timestamp,
    });
    telegramHarness.hooks().onOutboundMessage('tg:123', 'Investigating now.');

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
    let token = 'bad-token';
    const telegramHarness = createTelegramChannelHarness({
      reconfigure: async (nextToken) => {
        if (nextToken === 'bad-token') {
          throw new Error('Telegram rejected the token');
        }
      },
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
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

    expect(telegramHarness.reconfigure).toHaveBeenLastCalledWith(null);
    expect(host.getSnapshot().externalChannels.telegram).toEqual({
      botUsername: null,
      configured: false,
      discoveredChats: [],
      errorMessage: null,
      status: 'not-configured',
    });
    expect(readPersistedRuntimeState(homeDir).telegramTokenFingerprint).toBeNull();
  });

  it('surfaces Telegram connect timeouts without leaving startup hung', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelHarness({
      reconfigure: async () => {
        throw new Error(
          'Telegram failed to connect within 15s. Check the Network settings or proxy configuration.',
        );
      },
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      createTelegramChannel: telegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });

    await host.start();

    expect(host.getSnapshot().externalChannels.telegram).toMatchObject({
      configured: true,
      status: 'error',
      errorMessage:
        'Telegram failed to connect within 15s. Check the Network settings or proxy configuration.',
    });
  });

  it('preserves discovered Telegram chats across restart when the token fingerprint is unchanged', async () => {
    const homeDir = createTempHome();
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
      createTelegramChannel: firstTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: firstHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => token,
    });

    await firstHost.start();

    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();
    firstTelegramHarness.hooks().onChatMetadata('tg:123', timestamp, 'HashG', 'telegram', false);

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
    expect(readPersistedRuntimeState(homeDir).telegramTokenFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('clears discovered Telegram chats across restart when the token fingerprint changes', async () => {
    const homeDir = createTempHome();
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
      createTelegramChannel: firstTelegramHarness.createTelegramChannel,
      homeDir,
      loadAgentLiteModule: firstHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'first-token',
    });

    await firstHost.start();

    firstTelegramHarness.hooks().onChatMetadata(
      'tg:123',
      new Date('2026-04-04T01:00:00.000Z').toISOString(),
      'HashG',
      'telegram',
      false,
    );
    await firstHost.shutdown();

    const restartedHost = new AgentLiteHost({
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
    expect(readPersistedRuntimeState(homeDir).externalChannels?.telegram?.discoveredChats).toEqual([]);
  });

  it('shuts down without reconfiguring Telegram and clears the wrapper after AgentLite stops', async () => {
    const homeDir = createTempHome();
    let connected = false;
    const connect = vi.fn(async () => {
      connected = true;
    });
    const disconnect = vi.fn(async () => {
      connected = false;
      throw new Error('the worker has exited');
    });
    let runtimeChannel!: RuntimeTelegramChannel;
    const stop = vi.fn(async () => {
      await runtimeChannel?.disconnect();
    });
    const loadAgentLiteModule = async () => ({
      AgentLite: class {
        constructor() {}

        registerChannel = vi.fn().mockResolvedValue(undefined);
        registerGroup = vi.fn();
        start = vi.fn().mockResolvedValue(undefined);
        stop = stop;
      },
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      createTelegramChannel: (hooks) => {
        const channel = new ManagedTelegramChannel(hooks, {
          createChannel: () => ({
            _setOpts: vi.fn(),
            connect,
            disconnect,
            getBotUsername: () => 'agentlite_test_bot',
            isConnected: () => connected,
            sendMessage: vi.fn(),
          }),
        });
        runtimeChannel = channel;
        return channel;
      },
      homeDir,
      loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotToken: async () => 'telegram-bot-token',
    });
    const reconfigureSpy = vi.spyOn(ManagedTelegramChannel.prototype, 'reconfigure');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await host.start();
    await expect(host.shutdown()).resolves.toBeUndefined();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(reconfigureSpy).toHaveBeenCalledTimes(1);
    expect(reconfigureSpy).toHaveBeenCalledWith('telegram-bot-token');
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(runtimeChannel.isConnected()).toBe(false);
  });
});
