import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Agent,
  AgentEvents,
  AgentLite,
  AgentLiteOptions,
  AgentOptions,
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
  type AgentStore,
  type TelegramSecretsStore,
} from '@/electron/runtime-core/agentlite-host';
import type { DuneChannel } from '@/electron/runtime-core/dune-channel';
import { createProjectMainAgentName } from '@/shared/agents/project-main-name';

type AgentLiteModule = typeof import('@boxlite-ai/agentlite');

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agentlite-home-'));
}

function createMemoryStore(initialData: Record<string, unknown> = {}): AgentStore {
  const data = new Map<string, unknown>(Object.entries(initialData));
  return {
    async get<T>(key: string) {
      return (data.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      data.set(key, value);
    },
  };
}

function createMemorySecretsStore(
  initialData: Record<string, unknown> = {},
): TelegramSecretsStore & { getData: () => Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initialData));

  return {
    delete: async (key: string) => {
      data.delete(key);
    },
    get: async <T,>(key: string) => (data.get(key) as T) ?? null,
    getData: () => data,
    keys: async () => [...data.keys()],
    set: async <T,>(key: string, value: T) => {
      data.set(key, value);
    },
  };
}

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

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

interface MockAgent {
  _emit: <K extends keyof AgentEvents & string>(event: K, ...args: AgentEvents[K]) => void;
  _options: AgentOptions;
  addChannel: ReturnType<typeof vi.fn>;
  channelDrivers: Map<string, ChannelDriver>;
  name: string;
  off: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  registerGroup: ReturnType<typeof vi.fn>;
  registeredGroups: Record<string, unknown>;
  removeChannel: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function createAgentLiteModuleHarness(
  harnessOptions: {
    start?: () => Promise<void> | void;
  } = {},
) {
  let capturedOptions: AgentLiteOptions | null = null;
  const agents = new Map<string, MockAgent>();
  const stop = vi.fn(async () => {
    agents.clear();
  });
  const deleteAgent = vi.fn(async (name: string) => {
    agents.delete(name);
  });

  const createAgent = vi.fn((name: string, options?: AgentOptions): MockAgent => {
    type EventHandler = (...args: unknown[]) => void;
    const eventHandlers = new Map<string, EventHandler[]>();
    const channelDrivers = new Map<string, ChannelDriver>();
    const registeredGroups: Record<string, unknown> = {};

    const onImpl = (event: string, handler: EventHandler) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }

      eventHandlers.get(event)!.push(handler);
    };
    const offImpl = (event: string, handler: EventHandler) => {
      const handlers = eventHandlers.get(event);

      if (handlers) {
        eventHandlers.set(event, handlers.filter((h) => h !== handler));
      }
    };

    const mockAgent: MockAgent = {
      _emit: (event, ...args) => {
        const handlers = eventHandlers.get(event);

        if (handlers) {
          for (const handler of handlers) {
            handler(...args);
          }
        }
      },
      _options: options ?? {},
      addChannel: vi.fn(),
      channelDrivers,
      name,
      off: vi.fn(offImpl),
      on: vi.fn(onImpl),
      once: vi.fn((event: string, handler: EventHandler) => {
        const wrappedHandler = (...args: unknown[]) => {
          handler(...args);
          offImpl(event, wrappedHandler);
        };

        onImpl(event, wrappedHandler);
      }),
      registerGroup: vi.fn(async (jid: string, group: unknown) => {
        registeredGroups[jid] = group;
      }),
      registeredGroups,
      removeChannel: vi.fn(),
      start: vi.fn(async () => {
        await harnessOptions.start?.();
        const channels = options?.channels ?? {};

        for (const [key, factory] of Object.entries(channels)) {
          const config: ChannelDriverConfig = {
            onChatMetadata: vi.fn(),
            onMessage: vi.fn(),
            registeredGroups: () => registeredGroups,
          };
          const driver = await factory(config);
          channelDrivers.set(key, driver);
          await driver.connect();
        }
      }),
      stop: vi.fn(async () => {
        for (const driver of channelDrivers.values()) {
          await driver.disconnect();
        }
      }),
    };

    agents.set(name, mockAgent);
    return mockAgent;
  });

  return {
    agents,
    capturedOptions: () => capturedOptions,
    createAgent,
    deleteAgent,
    duneChannel: (agentNameSubstring?: string): DuneChannel => {
      const mockAgent = agentNameSubstring
        ? [...agents.values()].find((a) => a.name.includes(agentNameSubstring))
        : [...agents.values()][0];

      if (!mockAgent) {
        throw new Error(
          `No agent found${agentNameSubstring ? ` matching "${agentNameSubstring}"` : ''}.`,
        );
      }

      const driver = mockAgent.channelDrivers.get('dune');

      if (!driver) {
        throw new Error(
          `DuneChannel not found for agent "${mockAgent.name}".`,
        );
      }

      return driver as DuneChannel;
    },
    loadAgentLiteModule: (async () =>
      ({
        createAgentLite: async (options?: AgentLiteOptions) => {
          capturedOptions = options ?? null;
          return {
            agents: agents as unknown as ReadonlyMap<string, Agent>,
            createAgent: createAgent as unknown as AgentLite['createAgent'],
            deleteAgent,
            stop,
          } as AgentLite;
        },
      }) as unknown as AgentLiteModule),
    mockAgent: (nameSubstring?: string): MockAgent => {
      const mockAgent = nameSubstring
        ? [...agents.values()].find((a) => a.name.includes(nameSubstring))
        : [...agents.values()][0];

      if (!mockAgent) {
        throw new Error(
          `No mock agent found${nameSubstring ? ` matching "${nameSubstring}"` : ''}.`,
        );
      }

      return mockAgent;
    },
    stop,
  };
}

function createTelegramChannelFactoryHarness(
  options: {
    connect?: () => Promise<void> | void;
    disconnect?: () => Promise<void> | void;
    isConnected?: () => boolean;
    sendMessage?: (jid: string, text: string) => Promise<void> | void;
  } = {},
) {
  const connectedTokens = new Set<string>();
  let currentToken: string | null = null;
  const configsByToken = new Map<string, ChannelDriverConfig>();
  const connect = vi.fn(async () => {
    await options.connect?.();
    if (currentToken) {
      connectedTokens.add(currentToken);
    }
  });
  const disconnect = vi.fn(async () => {
    await options.disconnect?.();
    if (currentToken) {
      connectedTokens.delete(currentToken);
    }
  });
  const sendMessage = vi.fn(async (jid: string, text: string) => {
    await options.sendMessage?.(jid, text);
  });

  const resolveConfig = (token?: string | null) => {
    if (token) {
      return configsByToken.get(token) ?? null;
    }

    if (currentToken) {
      return configsByToken.get(currentToken) ?? null;
    }

    const [onlyConfig] = configsByToken.values();
    return onlyConfig ?? null;
  };

  return {
    connect,
    createTelegramChannelFactory: async (token: string): Promise<ChannelDriverFactory> => {
      currentToken = token;
      return (config: ChannelDriverConfig) => {
        configsByToken.set(token, config);
        const channel: ChannelDriver = {
          connect: async () => {
            currentToken = token;
            await connect();
          },
          disconnect: async () => {
            currentToken = token;
            await disconnect();
          },
          isConnected: vi.fn(() => (options.isConnected ? options.isConnected() : connectedTokens.has(token))),
          ownsJid: (jid: string) => jid.startsWith('tg:'),
          sendMessage,
        };
        return channel;
      };
    },
    disconnect,
    emitChatMetadata: (
      chatJid: string,
      {
        isGroup = true,
        name,
        timestamp = new Date().toISOString(),
      }: {
        isGroup?: boolean;
        name?: string;
        timestamp?: string;
      } = {},
      token?: string,
    ) => {
      const currentConfig = resolveConfig(token);

      if (!currentConfig) {
        throw new Error('Telegram observer has not been created yet.');
      }

      currentConfig.onChatMetadata(chatJid, timestamp, name, 'telegram', isGroup);
    },
    emitIncomingMessage: (
      chatJid: string,
      {
        attachments,
        content,
        isBotMessage = false,
        isFromMe = false,
        sender = 'telegram-user',
        senderName,
        timestamp = new Date().toISOString(),
      }: {
        attachments?: string[];
        content: string;
        isBotMessage?: boolean;
        isFromMe?: boolean;
        sender?: string;
        senderName?: string;
        timestamp?: string;
      },
      token?: string,
    ) => {
      const currentConfig = resolveConfig(token);

      if (!currentConfig) {
        throw new Error('Telegram observer has not been created yet.');
      }

      currentConfig.onMessage(chatJid, {
        chat_jid: chatJid,
        content,
        is_bot_message: isBotMessage,
        is_from_me: isFromMe,
        sender,
        timestamp,
        ...(attachments?.length ? { attachments } : {}),
        ...(senderName ? { sender_name: senderName } : {}),
      });
    },
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
    expect(host.getSnapshot().runtimeInfo).toEqual({
      message: 'AgentLite is running with saved model credentials.',
      mode: 'real',
      rootPath: runtimeRoot,
      status: 'ready',
    });
    expect(harness.createAgent).not.toHaveBeenCalled();

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

    const agentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Test Agent',
      projectId: 'project-1',
    });

    const mockAgent = harness.mockAgent();
    const resolvedCredentials = await mockAgent._options.credentials?.();

    expect(resolvedCredentials).toEqual({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      ANTHROPIC_BASE_URL: 'https://compatible.example/v1',
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

    expect(host.getSnapshot().runtimeInfo.message).toBe(
      'AgentLite is running without saved model credentials; replies will fail.',
    );
  });

  it('retries AgentLite startup when BoxLite runtime lock contention is transient', async () => {
    vi.useFakeTimers();

    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    let createAgentLiteAttempts = 0;

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: async () => ({
        createAgentLite: async (options?: AgentLiteOptions) => {
          createAgentLiteAttempts += 1;

          if (createAgentLiteAttempts < 3) {
            throw new Error(
              'internal error: Failed to acquire runtime lock at /tmp/.boxlite: internal error: Another BoxliteRuntime is already using directory: /tmp/.boxlite',
            );
          }

          const agentLiteModule = await harness.loadAgentLiteModule();
          return agentLiteModule.createAgentLite(options);
        },
      }) as unknown as AgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    const startPromise = host.start();
    await vi.advanceTimersByTimeAsync(500);
    await startPromise;

    expect(createAgentLiteAttempts).toBe(3);
    expect(host.getSnapshot().runtimeInfo.status).toBe('ready');
  });

  it('reinitializes AgentLite lazily if it disappears before creating an agent runtime', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    let createAgentLiteCalls = 0;

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: async () => ({
        createAgentLite: async (options?: AgentLiteOptions) => {
          createAgentLiteCalls += 1;
          const agentLiteModule = await harness.loadAgentLiteModule();
          return agentLiteModule.createAgentLite(options);
        },
      }) as unknown as AgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();
    (host as any).agentLite = null;

    const agentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Molly',
      projectId: 'project-1',
    });

    expect(agentId).toMatch(/^dune:agent:/);
    expect(createAgentLiteCalls).toBe(2);
    expect(harness.mockAgent('molly').start).toHaveBeenCalledTimes(1);
  });

  it('creates one project-main agent per project and keeps a stable Dune character name', async () => {
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

    const initialAgentId = await host.service.ensureProjectMainAgent('project-1', 'Research Platform');
    const renamedAgentId = await host.service.ensureProjectMainAgent('project-1', 'Studio Systems');

    expect(renamedAgentId).toBe(initialAgentId);
    expect(harness.createAgent).toHaveBeenCalledTimes(1);

    const snapshotAgent = host.getSnapshot().agents.find((agent) => agent.id === initialAgentId);

    expect(snapshotAgent).toMatchObject({
      name: createProjectMainAgentName('project-1'),
      projectId: 'project-1',
      role: 'project-main',
    });

    const mockAgent = harness.mockAgent();

    expect(mockAgent._options.channels).toBeDefined();
    expect(mockAgent._options.channels).toHaveProperty('dune');
    expect(mockAgent.start).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight project-main runtime start before sending the first message', async () => {
    const homeDir = createTempHome();
    const startGate = createDeferred<void>();
    const harness = createAgentLiteModuleHarness({
      start: async () => {
        await startGate.promise;
      },
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();

    const ensurePromise = host.service.ensureProjectMainAgent('project-1', 'Research Platform');
    const optimisticAgentId = host.getSnapshot().agents[0]?.id;

    expect(optimisticAgentId).toBeTruthy();

    if (!optimisticAgentId) {
      throw new Error('Expected the optimistic project-main agent to be present.');
    }

    let sendSettled = false;
    const sendPromise = host.service.sendMessage(
      optimisticAgentId,
      'Investigate the broken chat startup.',
    ).then(() => {
      sendSettled = true;
    });

    await Promise.resolve();

    expect(sendSettled).toBe(false);
    expect(harness.createAgent).toHaveBeenCalledTimes(1);

    startGate.resolve();

    const ensuredAgentId = await ensurePromise;
    await sendPromise;

    expect(ensuredAgentId).toBe(optimisticAgentId);
    expect(harness.createAgent).toHaveBeenCalledTimes(1);

    const snapshotAgent = host.getSnapshot().agents.find((agent) => agent.id === ensuredAgentId);

    expect(snapshotAgent?.messages.map((message) => ({
      content: message.content,
      role: message.role,
      status: message.status,
    }))).toEqual([
      {
        content: 'Investigate the broken chat startup.',
        role: 'user',
        status: 'complete',
      },
      {
        content: '',
        role: 'assistant',
        status: 'streaming',
      },
    ]);
  });

  it('rolls back a project-main agent when runtime startup fails', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness({
      start: async () => {
        throw new Error('Agent runtime boot failed');
      },
    });
    const store = createMemoryStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: store,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();

    await expect(
      host.service.ensureProjectMainAgent('project-1', 'Research Platform'),
    ).rejects.toThrow('Agent runtime boot failed');

    expect(host.getSnapshot().agents).toEqual([]);
    expect(await store.get<unknown[]>('agents')).toEqual([]);
    expect(harness.deleteAgent).toHaveBeenCalledTimes(1);
  });

  it('blocks startup when persisted agents have no project ownership', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const store = createMemoryStore({
      agents: [
        {
          agent: {
            channel: {
              canCompose: true,
              id: 'dune-chat',
              kind: 'built-in',
              label: 'Dune chat',
              status: 'ready',
            },
            contextCards: [],
            id: 'dune:agent:legacy',
            messages: [],
            name: 'Legacy agent',
            note: 'Legacy agent',
            preview: 'Legacy agent',
            projectId: null,
            role: 'custom',
            status: 'draft',
            updatedAt: 1,
            workspace: 'AgentLite agent',
          },
          groupFolder: 'legacy-agent',
        },
      ],
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: store,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();

    expect(harness.stop).not.toHaveBeenCalled();
    expect(host.getSnapshot().runtimeInfo.status).toBe('error');
    expect(host.getSnapshot().runtimeInfo.message).toContain(
      'Legacy Dune agent state contains agents without project ownership.',
    );
    await expect(host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
      projectId: 'project-1',
    })).rejects.toThrow(/without project ownership/i);
  });

  it('normalizes persisted in-flight agent state during load', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const store = createMemoryStore({
      agents: [
        {
          agent: {
            channel: {
              canCompose: true,
              id: 'dune-chat',
              kind: 'built-in',
              label: 'Dune chat',
              status: 'ready',
            },
            contextCards: [],
            id: 'dune:agent:west',
            messages: [
              {
                content: 'Investigate west',
                createdAt: 1,
                id: 'message-user-1',
                role: 'user',
                status: 'complete',
              },
              {
                content: 'Partial west response',
                createdAt: 2,
                id: 'message-assistant-1',
                role: 'assistant',
                status: 'streaming',
              },
            ],
            name: 'West lead',
            note: 'West lead',
            preview: 'Partial west response',
            projectId: 'project-west',
            role: 'custom',
            status: 'live',
            telegram: null,
            updatedAt: 2,
            workspace: 'AgentLite agent',
          },
          groupFolder: 'west-lead',
        },
        {
          agent: {
            channel: {
              canCompose: true,
              id: 'dune-chat',
              kind: 'built-in',
              label: 'Dune chat',
              status: 'ready',
            },
            contextCards: [],
            id: 'dune:agent:east',
            messages: [
              {
                content: 'Investigate east',
                createdAt: 3,
                id: 'message-user-2',
                role: 'user',
                status: 'complete',
              },
              {
                content: '',
                createdAt: 4,
                id: 'message-assistant-2',
                role: 'assistant',
                status: 'streaming',
              },
            ],
            name: 'East lead',
            note: 'East lead',
            preview: 'Investigate east',
            projectId: 'project-east',
            role: 'custom',
            status: 'live',
            telegram: null,
            updatedAt: 4,
            workspace: 'AgentLite agent',
          },
          groupFolder: 'east-lead',
        },
      ],
      selectedAgentId: 'dune:agent:west',
    });

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: store,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
    });

    await host.start();

    const westAgent = host.getSnapshot().agents.find((agent) => agent.id === 'dune:agent:west');
    const eastAgent = host.getSnapshot().agents.find((agent) => agent.id === 'dune:agent:east');

    expect(westAgent?.status).toBe('ready');
    expect(westAgent?.messages.map((message) => ({
      content: message.content,
      status: message.status,
    }))).toEqual([
      {
        content: 'Investigate west',
        status: 'complete',
      },
      {
        content: 'Partial west response',
        status: 'complete',
      },
    ]);
    expect(eastAgent?.status).toBe('ready');
    expect(eastAgent?.messages.map((message) => ({
      content: message.content,
      status: message.status,
    }))).toEqual([
      {
        content: 'Investigate east',
        status: 'complete',
      },
    ]);
  });

  it('stops only the deleted agent when its last agent is removed', async () => {
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

    const firstAgentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Alpha',
      projectId: 'project-1',
    });
    await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Beta',
      projectId: 'project-2',
    });

    expect(harness.createAgent).toHaveBeenCalledTimes(2);

    const deleteAgentCallsBefore = harness.deleteAgent.mock.calls.length;

    await host.service.deleteAgent(firstAgentId);

    expect(harness.deleteAgent).toHaveBeenCalledTimes(deleteAgentCallsBefore + 1);

    const deletedGroupFolder = harness.deleteAgent.mock.calls[deleteAgentCallsBefore]![0] as string;
    expect(deletedGroupFolder).toContain('alpha');

    expect(host.getSnapshot().agents.map((agent) => agent.projectId)).toEqual(['project-2']);

    await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Gamma',
      projectId: 'project-1',
    });

    expect(harness.createAgent).toHaveBeenCalledTimes(3);
  });

  it('routes built-in Dune chat replies through the correct agent', async () => {
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

    const westAgentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'West lead',
      projectId: 'project-west',
    });
    const eastAgentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'East lead',
      projectId: 'project-east',
    });

    const westChannel = harness.duneChannel('west');
    const eastChannel = harness.duneChannel('east');

    await westChannel.sendMessage(westAgentId, 'West response');
    await eastChannel.sendMessage(eastAgentId, 'East response');

    const westAgent = host.getSnapshot().agents.find((agent) => agent.id === westAgentId);
    const eastAgent = host.getSnapshot().agents.find((agent) => agent.id === eastAgentId);

    expect(westAgent?.messages.map((message) => message.content)).toEqual(['West response']);
    expect(eastAgent?.messages.map((message) => message.content)).toEqual(['East response']);
  });

  it('allows concurrent sends for different agents while replies are still streaming', async () => {
    vi.useFakeTimers();

    try {
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

      const westAgentId = await host.service.createAgent({
        channelId: 'dune-chat',
        name: 'West lead',
        projectId: 'project-west',
      });
      const eastAgentId = await host.service.createAgent({
        channelId: 'dune-chat',
        name: 'East lead',
        projectId: 'project-east',
      });

      await host.service.sendMessage(westAgentId, 'Investigate west.');
      await host.service.sendMessage(eastAgentId, 'Investigate east.');

      const streamingSnapshot = host.getSnapshot();
      const westAgent = streamingSnapshot.agents.find((agent) => agent.id === westAgentId);
      const eastAgent = streamingSnapshot.agents.find((agent) => agent.id === eastAgentId);

      expect(streamingSnapshot.isStreaming).toBe(true);
      expect(westAgent?.messages.map((message) => message.status)).toEqual([
        'complete',
        'streaming',
      ]);
      expect(eastAgent?.messages.map((message) => message.status)).toEqual([
        'complete',
        'streaming',
      ]);

      await harness.duneChannel('west').sendMessage(westAgentId, 'West response');
      await harness.duneChannel('east').sendMessage(eastAgentId, 'East response');
      await vi.advanceTimersByTimeAsync(400);

      const completedSnapshot = host.getSnapshot();

      expect(completedSnapshot.isStreaming).toBe(false);
      expect(
        completedSnapshot.agents.find((agent) => agent.id === westAgentId)?.messages.map((message) =>
          message.content
        ),
      ).toEqual(['Investigate west.', 'West response']);
      expect(
        completedSnapshot.agents.find((agent) => agent.id === eastAgentId)?.messages.map((message) =>
          message.content
        ),
      ).toEqual(['Investigate east.', 'East response']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a second send while the same agent already has a pending reply', async () => {
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

    const agentId = await host.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
      projectId: 'project-1',
    });

    await host.service.sendMessage(agentId, 'First pass.');
    await host.service.sendMessage(agentId, 'Second pass.');

    expect(host.getSnapshot().agents.find((agent) => agent.id === agentId)?.messages.map((message) => ({
      content: message.content,
      status: message.status,
    }))).toEqual([
      {
        content: 'First pass.',
        status: 'complete',
      },
      {
        content: '',
        status: 'streaming',
      },
    ]);
  });

  it('starts a Telegram setup session and matches the first chat that submits the pair code', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore: createMemorySecretsStore(),
    });

    await host.start();
    const sessionId = await host.service.startTelegramSetupSession({
      token: 'telegram-bot-token',
    });

    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();
    const pairCode = host.getSnapshot().telegramSetupSessions[0]?.pairCode;

    expect(sessionId).toMatch(/^telegram-session-/);
    expect(pairCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(host.getSnapshot().telegramSetupSessions[0]).toMatchObject({
      botUsername: 'agentlite_test_bot',
      pairingStatus: 'listening',
      status: 'connected',
    });

    telegramHarness.emitChatMetadata('tg:123', {
      isGroup: true,
      name: 'Product QA',
      timestamp,
    });
    telegramHarness.emitIncomingMessage('tg:123', {
      content: `/pair ${pairCode?.toLowerCase() ?? ''}`,
      sender: 'alice',
      senderName: 'Alice',
      timestamp,
    });
    await flushMicrotasks();

    expect(host.getSnapshot().telegramSetupSessions[0]).toMatchObject({
      matchedChat: {
        channelId: 'telegram',
        jid: 'tg:123',
        kind: 'group',
        name: 'Product QA',
      },
      pairingStatus: 'matched',
    });
  });

  it('creates Telegram agents from matched setup sessions and stores the bot token per agent', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();
    const sessionId = await host.service.startTelegramSetupSession({
      token: 'telegram-bot-token',
    });
    const pairCode = host.getSnapshot().telegramSetupSessions[0]?.pairCode ?? '';
    const timestamp = new Date('2026-04-04T01:00:00.000Z').toISOString();

    telegramHarness.emitChatMetadata('tg:123', {
      isGroup: true,
      name: 'Product QA',
      timestamp,
    });
    telegramHarness.emitIncomingMessage('tg:123', {
      content: `/pair ${pairCode}`,
      sender: 'alice',
      senderName: 'Alice',
      timestamp,
    });
    await flushMicrotasks();

    const agentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'Release triage',
      projectId: 'project-1',
      telegramSetupSessionId: sessionId,
    });

    const agent = host.getSnapshot().agents.find((item) => item.id === agentId);

    expect(agent?.channel.target).toEqual({
      channelId: 'telegram',
      jid: 'tg:123',
      kind: 'group',
      name: 'Product QA',
    });
    expect(agent?.telegram).toMatchObject({
      botUsername: 'agentlite_test_bot',
      boundChat: {
        channelId: 'telegram',
        jid: 'tg:123',
        kind: 'group',
        name: 'Product QA',
      },
      status: 'connected',
    });
    expect([...telegramSecretsStore.getData().keys()]).toEqual([
      `agent:${agentId}:telegram:bot-token`,
    ]);
    expect(host.getSnapshot().telegramSetupSessions).toEqual([]);
  });

  it('preserves Telegram media as attachment metadata instead of only inline placeholder text', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();
    const sessionId = await host.service.startTelegramSetupSession({
      token: 'telegram-bot-token',
    });
    const pairCode = host.getSnapshot().telegramSetupSessions[0]?.pairCode ?? '';

    telegramHarness.emitChatMetadata('tg:123', {
      isGroup: true,
      name: 'Product QA',
    });
    telegramHarness.emitIncomingMessage('tg:123', {
      content: `/pair ${pairCode}`,
      sender: 'alice',
      senderName: 'Alice',
    });
    await flushMicrotasks();

    const agentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'Release triage',
      projectId: 'project-1',
      telegramSetupSessionId: sessionId,
    });

    telegramHarness.emitIncomingMessage('tg:123', {
      attachments: ['/workspace/group/attachments/photo_100.png'],
      content: '[Photo] (/workspace/group/attachments/photo_100.png) Look at this',
      sender: 'alice',
      senderName: 'Alice',
    });
    await flushMicrotasks();

    const agent = host.getSnapshot().agents.find((item) => item.id === agentId);
    const message = agent?.messages[0];

    expect(message).toMatchObject({
      content: 'Alice: [Photo] Look at this',
      format: 'plain',
      role: 'user',
    });
    expect(message?.attachments).toHaveLength(1);
    expect(message?.attachments[0]).toMatchObject({
      kind: 'image',
      name: 'photo_100.png',
    });
    expect(new URL(message?.attachments[0]?.url ?? '').pathname).toMatch(
      /\/\.dune\/agentlite\/groups\/release-triage-[^/]+\/attachments\/photo_100\.png$/,
    );
  });

  it('allows multiple agents to bind the same Telegram chat on one token and fans inbound messages out to each of them', async () => {
    vi.useFakeTimers();

    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();

    const firstSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const firstPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === firstSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'shared-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${firstPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();
    const firstAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'West triage',
      projectId: 'project-west',
      telegramSetupSessionId: firstSessionId,
    });

    const secondSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const secondPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === secondSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'shared-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${secondPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();
    const secondAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'East triage',
      projectId: 'project-east',
      telegramSetupSessionId: secondSessionId,
    });

    telegramHarness.emitIncomingMessage('tg:101', {
      content: 'Need eyes on release',
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();

    let firstAgent = host.getSnapshot().agents.find((agent) => agent.id === firstAgentId);
    let secondAgent = host.getSnapshot().agents.find((agent) => agent.id === secondAgentId);

    expect(telegramHarness.connect).toHaveBeenCalledTimes(1);
    expect(firstAgent?.messages).toHaveLength(2);
    expect(secondAgent?.messages).toHaveLength(2);
    expect(firstAgent?.messages[0]?.content).toBe('Need eyes on release');
    expect(secondAgent?.messages[0]?.content).toBe('Need eyes on release');

    await harness.duneChannel('east').sendMessage(secondAgentId, 'Investigating now.');
    await vi.advanceTimersByTimeAsync(400);

    await host.service.deleteAgent(firstAgentId);
    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(0);

    telegramHarness.emitIncomingMessage('tg:101', {
      content: 'Still blocked',
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();

    secondAgent = host.getSnapshot().agents.find((agent) => agent.id === secondAgentId);

    expect(secondAgent?.messages.map((message) => message.content)).toEqual([
      'Need eyes on release',
      'Investigating now.',
      'Still blocked',
      '',
    ]);

    await host.service.deleteAgent(secondAgentId);
    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(1);
  });

  it('isolates same-chat Telegram traffic by bot token fingerprint', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();

    const westSessionId = await host.service.startTelegramSetupSession({ token: 'west-token' });
    const westPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === westSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'west-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${westPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'west-token');
    await flushMicrotasks();
    const westAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'West triage',
      projectId: 'project-west',
      telegramSetupSessionId: westSessionId,
    });

    const eastSessionId = await host.service.startTelegramSetupSession({ token: 'east-token' });
    const eastPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === eastSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'east-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${eastPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'east-token');
    await flushMicrotasks();
    const eastAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'East triage',
      projectId: 'project-east',
      telegramSetupSessionId: eastSessionId,
    });

    telegramHarness.emitIncomingMessage('tg:101', {
      content: 'West-only incident',
      sender: 'hashg',
      senderName: 'HashG',
    }, 'west-token');
    await flushMicrotasks();

    let westAgent = host.getSnapshot().agents.find((agent) => agent.id === westAgentId);
    let eastAgent = host.getSnapshot().agents.find((agent) => agent.id === eastAgentId);

    expect(telegramHarness.connect).toHaveBeenCalledTimes(2);
    expect(westAgent?.messages).toHaveLength(2);
    expect(westAgent?.messages[0]?.content).toBe('West-only incident');
    expect(eastAgent?.messages).toHaveLength(0);

    telegramHarness.emitIncomingMessage('tg:101', {
      content: 'East-only incident',
      sender: 'hashg',
      senderName: 'HashG',
    }, 'east-token');
    await flushMicrotasks();

    westAgent = host.getSnapshot().agents.find((agent) => agent.id === westAgentId);
    eastAgent = host.getSnapshot().agents.find((agent) => agent.id === eastAgentId);

    expect(westAgent?.messages.map((message) => message.content)).toEqual([
      'West-only incident',
      '',
    ]);
    expect(eastAgent?.messages.map((message) => message.content)).toEqual([
      'East-only incident',
      '',
    ]);
  });

  it('shares one observer per Telegram token and routes traffic by chat within that token', async () => {
    vi.useFakeTimers();

    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();

    const westSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const westPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === westSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: true,
      name: 'West QA',
    });
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${westPairCode}`,
      sender: 'alice',
      senderName: 'Alice',
    });
    await flushMicrotasks();
    const westAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'West triage',
      projectId: 'project-west',
      telegramSetupSessionId: westSessionId,
    });

    const eastSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const eastPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === eastSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:202', {
      isGroup: true,
      name: 'East QA',
    });
    telegramHarness.emitIncomingMessage('tg:202', {
      content: `/pair ${eastPairCode}`,
      sender: 'bob',
      senderName: 'Bob',
    });
    await flushMicrotasks();
    const eastAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'East triage',
      projectId: 'project-east',
      telegramSetupSessionId: eastSessionId,
    });

    telegramHarness.emitIncomingMessage('tg:101', {
      content: 'West build is red',
      sender: 'alice',
      senderName: 'Alice',
    });
    telegramHarness.emitIncomingMessage('tg:202', {
      content: 'East build is flaky',
      sender: 'bob',
      senderName: 'Bob',
    });
    await flushMicrotasks();

    await harness.duneChannel('west').sendMessage(westAgentId, 'Investigating west.');
    await harness.duneChannel('east').sendMessage(eastAgentId, 'Investigating east.');
    await vi.advanceTimersByTimeAsync(400);

    const westAgent = host.getSnapshot().agents.find((agent) => agent.id === westAgentId);
    const eastAgent = host.getSnapshot().agents.find((agent) => agent.id === eastAgentId);

    expect(telegramHarness.connect).toHaveBeenCalledTimes(1);
    expect(westAgent?.messages.map((message) => message.content)).toEqual([
      'Alice: West build is red',
      'Investigating west.',
    ]);
    expect(eastAgent?.messages.map((message) => message.content)).toEqual([
      'Bob: East build is flaky',
      'Investigating east.',
    ]);
  });

  it('re-pairs an existing Telegram agent onto a chat already used by another agent', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();

    const firstSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const firstPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === firstSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'shared-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${firstPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();
    await host.service.createAgent({
      channelId: 'telegram',
      name: 'West triage',
      projectId: 'project-west',
      telegramSetupSessionId: firstSessionId,
    });

    const secondSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const secondPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === secondSessionId)?.pairCode ?? '';
    telegramHarness.emitChatMetadata('tg:202', {
      isGroup: false,
      name: 'Other Chat',
    }, 'shared-token');
    telegramHarness.emitIncomingMessage('tg:202', {
      content: `/pair ${secondPairCode}`,
      sender: 'other',
      senderName: 'Other',
    }, 'shared-token');
    await flushMicrotasks();
    const secondAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'East triage',
      projectId: 'project-east',
      telegramSetupSessionId: secondSessionId,
    });

    const repairSessionId = await host.service.startTelegramSetupSession({
      agentId: secondAgentId,
    });
    const repairPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === repairSessionId)?.pairCode ?? '';

    telegramHarness.emitChatMetadata('tg:101', {
      isGroup: false,
      name: 'HashG',
    }, 'shared-token');
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${repairPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'shared-token');
    await flushMicrotasks();

    const repairedAgent = host.getSnapshot().agents.find((agent) => agent.id === secondAgentId);

    expect(repairedAgent?.channel.target).toEqual({
      channelId: 'telegram',
      jid: 'tg:101',
      kind: 'dm',
      name: 'HashG',
    });
    expect(repairedAgent?.telegram).toMatchObject({
      boundChat: {
        channelId: 'telegram',
        jid: 'tg:101',
        kind: 'dm',
        name: 'HashG',
      },
      pairingStatus: 'matched',
      status: 'connected',
    });
  });

  it('keeps a shared-token observer alive until the last Telegram agent is deleted', async () => {
    const homeDir = createTempHome();
    const harness = createAgentLiteModuleHarness();
    const telegramHarness = createTelegramChannelFactoryHarness();
    const telegramSecretsStore = createMemorySecretsStore();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      agentStore: createMemoryStore(),
      createTelegramChannelFactory: telegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await host.start();

    const firstSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const firstPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === firstSessionId)?.pairCode ?? '';
    telegramHarness.emitIncomingMessage('tg:101', {
      content: `/pair ${firstPairCode}`,
      sender: 'alice',
      senderName: 'Alice',
    });
    await flushMicrotasks();
    const firstAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'West triage',
      projectId: 'project-west',
      telegramSetupSessionId: firstSessionId,
    });

    const secondSessionId = await host.service.startTelegramSetupSession({ token: 'shared-token' });
    const secondPairCode = host.getSnapshot().telegramSetupSessions.find((session) => session.id === secondSessionId)?.pairCode ?? '';
    telegramHarness.emitIncomingMessage('tg:202', {
      content: `/pair ${secondPairCode}`,
      sender: 'bob',
      senderName: 'Bob',
    });
    await flushMicrotasks();
    const secondAgentId = await host.service.createAgent({
      channelId: 'telegram',
      name: 'East triage',
      projectId: 'project-east',
      telegramSetupSessionId: secondSessionId,
    });

    await host.service.deleteAgent(firstAgentId);
    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(0);

    await host.service.deleteAgent(secondAgentId);
    expect(telegramHarness.disconnect).toHaveBeenCalledTimes(1);
  });

  it('restores multiple Telegram agents bound to the same endpoint on restart', async () => {
    const homeDir = createTempHome();
    const agentStore = createMemoryStore();
    const telegramSecretsStore = createMemorySecretsStore();
    const firstHarness = createAgentLiteModuleHarness();
    const firstTelegramHarness = createTelegramChannelFactoryHarness();
    const secondHarness = createAgentLiteModuleHarness();
    const secondTelegramHarness = createTelegramChannelFactoryHarness();

    tempDirs.push(homeDir);

    const firstHost = new AgentLiteHost({
      agentStore,
      createTelegramChannelFactory: firstTelegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: firstHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await firstHost.start();
    const firstSessionId = await firstHost.service.startTelegramSetupSession({ token: 'telegram-bot-token' });
    const firstPairCode = firstHost.getSnapshot().telegramSetupSessions.find((session) => session.id === firstSessionId)?.pairCode ?? '';
    firstTelegramHarness.emitChatMetadata('tg:123', {
      isGroup: false,
      name: 'HashG',
    }, 'telegram-bot-token');
    firstTelegramHarness.emitIncomingMessage('tg:123', {
      content: `/pair ${firstPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'telegram-bot-token');
    await flushMicrotasks();
    await firstHost.service.createAgent({
      channelId: 'telegram',
      name: 'Restart triage west',
      projectId: 'project-1',
      telegramSetupSessionId: firstSessionId,
    });

    const secondSessionId = await firstHost.service.startTelegramSetupSession({ token: 'telegram-bot-token' });
    const secondPairCode = firstHost.getSnapshot().telegramSetupSessions.find((session) => session.id === secondSessionId)?.pairCode ?? '';
    firstTelegramHarness.emitChatMetadata('tg:123', {
      isGroup: false,
      name: 'HashG',
    }, 'telegram-bot-token');
    firstTelegramHarness.emitIncomingMessage('tg:123', {
      content: `/pair ${secondPairCode}`,
      sender: 'hashg',
      senderName: 'HashG',
    }, 'telegram-bot-token');
    await flushMicrotasks();
    await firstHost.service.createAgent({
      channelId: 'telegram',
      name: 'Restart triage east',
      projectId: 'project-1',
      telegramSetupSessionId: secondSessionId,
    });
    await firstHost.shutdown();

    const restartedHost = new AgentLiteHost({
      agentStore,
      createTelegramChannelFactory: secondTelegramHarness.createTelegramChannelFactory,
      homeDir,
      loadAgentLiteModule: secondHarness.loadAgentLiteModule,
      resolveModelCredentials: async () => ({}),
      resolveTelegramBotUsername: async () => 'agentlite_test_bot',
      telegramSecretsStore,
    });

    await restartedHost.start();
    await flushMicrotasks();

    secondTelegramHarness.emitIncomingMessage('tg:123', {
      content: 'Post-restart fanout',
      sender: 'hashg',
      senderName: 'HashG',
    }, 'telegram-bot-token');
    await flushMicrotasks();

    const restartedTelegramAgents = restartedHost.getSnapshot().agents
      .filter((agent) => agent.channel.id === 'telegram');

    expect(secondTelegramHarness.connect).toHaveBeenCalledTimes(1);
    expect(restartedTelegramAgents).toHaveLength(2);
    expect(restartedTelegramAgents.map((agent) => agent.telegram)).toEqual([
      expect.objectContaining({
        botUsername: 'agentlite_test_bot',
        boundChat: {
          channelId: 'telegram',
          jid: 'tg:123',
          kind: 'dm',
          name: 'HashG',
        },
        status: 'connected',
      }),
      expect.objectContaining({
        botUsername: 'agentlite_test_bot',
        boundChat: {
          channelId: 'telegram',
          jid: 'tg:123',
          kind: 'dm',
          name: 'HashG',
        },
        status: 'connected',
      }),
    ]);
    expect(restartedTelegramAgents.map((agent) => agent.messages.map((message) => message.content))).toEqual([
      ['Post-restart fanout', ''],
      ['Post-restart fanout', ''],
    ]);
    expect(secondTelegramHarness.lastToken()).toBe('telegram-bot-token');
  });

  it('shuts down cleanly by calling agentLite.stop()', async () => {
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
    await host.service.ensureProjectMainAgent('project-1', 'Research Platform');
    await expect(host.shutdown()).resolves.toBeUndefined();

    expect(harness.stop).toHaveBeenCalledTimes(1);
  });
});
