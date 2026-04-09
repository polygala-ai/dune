import { nanoid } from 'nanoid';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  AgentLite,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import type {
  Agent,
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelStatus,
  AgentExternalTarget,
  AgentMessage,
  AgentRole,
  AgentRuntimeInfo,
  CreateAgentInput,
  ExternalChannelsState,
  StartTelegramSetupSessionInput,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
  TelegramSetupSession,
} from '../../renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
  createDefaultTelegramAgentRuntimeState,
  createDefaultExternalChannelsState,
} from '../../renderer/features/agents/model/channels';
import { createProjectMainAgentName } from '../../shared/agents/project-main-name';
import {
  summarizeMessagePreview,
} from '../../shared/agents/message-content';
import {
  normalizeAgentAttachments,
} from './agent-message-attachments';
import { createIpcClaudeMd } from '../../shared/agent-ipc/ipc-claude-md';
import { DuneAgent } from './dune-agent';
import { TelegramBridge } from './telegram-bridge';
import type { TelegramSecretsStore } from './telegram-bridge';

const STREAMING_IDLE_WINDOW_MS = 320;
const STREAMING_SAFETY_TIMEOUT_MS = 30_000;
const AGENTLITE_LOCK_RETRY_DELAY_MS = 250;
const AGENTLITE_LOCK_RETRY_ATTEMPTS = 20;

export interface AgentServiceSnapshot {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
  telegramSetupSessions: TelegramSetupSession[];
}

export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

export interface AgentService {
  cancelTelegramSetupSession: (sessionId: string) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  ensureProjectMainAgent: (projectId: string, projectName: string) => Promise<string>;
  getTelegramSetupSession: (sessionId: string) => Promise<TelegramSetupSession | null>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  startTelegramSetupSession: (input: StartTelegramSetupSessionInput) => Promise<string>;
  subscribe: (listener: AgentServiceListener) => () => void;
}

export interface AgentRuntime {
  getSnapshot: () => AgentServiceSnapshot;
  reset: () => void;
  service: AgentService;
  subscribe: (listener: AgentServiceListener) => () => void;
}

interface PersistedAgentRecord {
  agent: AgentServiceSnapshot['agents'][number];
  groupFolder: string;
}

export interface AgentStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

interface PendingAssistantMessage {
  idleTimer: ReturnType<typeof globalThis.setTimeout> | null;
  messageId: string;
  safetyTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

function normalizePersistedMessages(
  messages: AgentMessage[],
  options: { groupFolder: string; runtimeRoot: string },
) {
  const persistedMessages = Array.isArray(messages) ? messages : [];
  const lastPersistedMessage = persistedMessages.at(-1);
  const normalizedMessages = persistedMessages.map((message) => ({
    ...message,
    attachments: normalizeAgentAttachments(message.attachments, options),
    format: (message.format === 'markdown' ? 'markdown' : 'plain') as AgentMessage['format'],
    status: message.status === 'streaming' ? 'complete' : message.status,
  }));

  if (
    lastPersistedMessage?.role === 'assistant'
    && lastPersistedMessage.content === ''
    && lastPersistedMessage.status === 'streaming'
  ) {
    normalizedMessages.pop();
  }

  return normalizedMessages;
}

type TelegramModule = typeof import('@boxlite-ai/agentlite/channels/telegram');

// eslint-disable-next-line no-new-func
const importTelegramModule = globalThis.Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<TelegramModule>;

export type { TelegramSecretsStore };

export interface AgentLiteHostOptions {
  agentStore: AgentStore;
  createTelegramChannelFactory?: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;
  homeDir?: string;
  loadAgentLiteModule?: () => Promise<typeof import('@boxlite-ai/agentlite')>;
  now?: () => number;
  onIpcDirCreated?: (agentId: string, agentName: string, projectId: string, ipcHostPath: string) => void;
  resolveModelCredentials?: () => Promise<Record<string, string>>;
  resolveTelegramBotUsername?: (token: string) => Promise<string | null>;
  telegramSecretsStore?: TelegramSecretsStore;
}

function cloneSnapshot(snapshot: AgentServiceSnapshot): AgentServiceSnapshot {
  return {
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      channel: {
        ...agent.channel,
        target: agent.channel.target ? { ...agent.channel.target } : null,
      },
      contextCards: agent.contextCards.map((card) => ({ ...card })),
      messages: agent.messages.map((message) => ({
        ...message,
        attachments: message.attachments.map((attachment) => ({ ...attachment })),
      })),
      projectId: agent.projectId ?? null,
      role: agent.role,
      telegram: cloneTelegramAgentRuntimeState(agent.telegram),
    })),
    externalChannels: cloneExternalChannelsState(snapshot.externalChannels),
    isStreaming: snapshot.isStreaming,
    runtimeInfo: { ...snapshot.runtimeInfo },
    selectedAgentId: snapshot.selectedAgentId,
    telegramSetupSessions: snapshot.telegramSetupSessions.map(cloneTelegramSetupSession),
  };
}

function createMessageId(role: AgentMessage['role'], now: number) {
  return `message-${role}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizePreview(content: string) {
  return summarizeMessagePreview(content);
}

function createRuntimeReadyMessage(credentials: Record<string, string>) {
  return Object.keys(credentials).length > 0
    ? 'AgentLite is running with saved model credentials.'
    : 'AgentLite is running without saved model credentials; replies will fail.';
}

function createRuntimeInfo(
  runtimeRoot: string,
  overrides: Partial<AgentRuntimeInfo> = {},
): AgentRuntimeInfo {
  return {
    mode: 'real',
    rootPath: runtimeRoot,
    status: 'starting',
    ...overrides,
  };
}

function createAgentId() {
  return `dune:agent:${nanoid()}`;
}

function isAgentLiteRuntimeLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('Failed to acquire runtime lock')
    || message.includes('Another BoxliteRuntime is already using directory');
}

function waitForTimeout(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function createGroupFolder(name: string, agentId: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';

  return `${slug}-${agentId.split(':').pop()?.slice(0, 8) ?? 'agent'}`;
}

function mapTelegramChannelStatus(status: TelegramConnectionStatus): AgentChannelStatus {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'error':
      return 'error';
    case 'disconnected':
    case 'not-configured':
      return 'disconnected';
    default:
      return 'disconnected';
  }
}

function createChannelBinding(
  channelId: AgentChannelId,
  telegramState: TelegramAgentRuntimeState | null,
  target: AgentExternalTarget | null = null,
): AgentChannelBinding {
  switch (channelId) {
    case 'discord':
      return {
        canCompose: false,
        id: 'discord',
        kind: 'external',
        label: 'Discord',
        status: 'coming-soon',
      };
    case 'slack':
      return {
        canCompose: false,
        id: 'slack',
        kind: 'external',
        label: 'Slack',
        status: 'coming-soon',
      };
    case 'telegram':
      return {
        canCompose: false,
        id: 'telegram',
        kind: 'external',
        label: 'Telegram',
        status: mapTelegramChannelStatus(telegramState?.status ?? 'disconnected'),
        ...(target ? { target } : {}),
      };
    default:
      return {
        canCompose: true,
        id: 'dune-chat',
        kind: 'built-in',
        label: 'Dune chat',
        status: 'ready',
      };
  }
}

function createDraftAgent(
  agentId: string,
  name: string,
  now: number,
  channelId: CreateAgentInput['channelId'],
  telegramState: TelegramAgentRuntimeState | null,
  externalTarget: AgentExternalTarget | null,
  projectId: string,
  role: AgentRole,
): Agent {
  const channel = createChannelBinding(channelId, telegramState, externalTarget);
  const isBuiltInChannel = channel.kind === 'built-in';
  const attachedLabel = channel.target?.name ?? channel.label;

  return {
    channel,
    contextCards: [],
    id: agentId,
    messages: [] satisfies AgentMessage[],
    name,
    note: isBuiltInChannel
      ? 'This agent is running inside the real AgentLite foundation that Dune now hosts directly in the desktop runtime.'
      : `This agent is bound to ${attachedLabel} and mirrors its transcript through the Dune host.`,
    preview: isBuiltInChannel
      ? 'Ready for a first instruction.'
      : `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
    projectId,
    role,
    status: 'draft',
    telegram: channelId === 'telegram'
      ? telegramState ?? createDefaultTelegramAgentRuntimeState({ boundChat: externalTarget })
      : null,
    updatedAt: now,
    workspace: 'AgentLite agent',
  };
}

function createUserMessage(content: string, now: number): AgentMessage {
  return {
    attachments: [],
    content,
    createdAt: now,
    format: 'plain',
    id: createMessageId('user', now),
    role: 'user',
    status: 'complete',
  };
}

function createAssistantMessage(now: number): AgentMessage {
  return {
    attachments: [],
    content: '',
    createdAt: now,
    format: 'markdown',
    id: createMessageId('assistant', now),
    role: 'assistant',
    status: 'streaming',
  };
}

function normalizePersistedAgentRecord(
  record: PersistedAgentRecord,
  runtimeRoot: string,
): PersistedAgentRecord {
  const groupFolder = record.groupFolder || createGroupFolder(record.agent.name, record.agent.id);

  return {
    agent: {
      ...record.agent,
      channel: {
        ...record.agent.channel,
        target: record.agent.channel.target ? { ...record.agent.channel.target } : null,
      },
      contextCards: record.agent.contextCards.map((card) => ({ ...card })),
      messages: normalizePersistedMessages(record.agent.messages, {
        groupFolder,
        runtimeRoot,
      }),
      projectId: typeof record.agent.projectId === 'string' ? record.agent.projectId : null,
      role: record.agent.role === 'project-main' ? 'project-main' : 'custom',
      status: record.agent.status === 'live' ? 'ready' : record.agent.status,
      telegram: cloneTelegramAgentRuntimeState(record.agent.telegram),
    },
    groupFolder,
  };
}

export function resolveAgentLiteRuntimeRoot(homeDir: string = os.homedir()) {
  return path.join(homeDir, '.dune', 'agentlite');
}

const IPC_GROUP_CLAUDE_MD_SECTION = `

---

## Dune IPC

You have access to a filesystem IPC channel for communicating with the Dune host app. Read \`/workspace/extra/ipc/CLAUDE.md\` for the full protocol.

Quick reference:
- Read messages from \`/workspace/extra/ipc/host/\` (read and delete)
- Write messages to \`/workspace/extra/ipc/agent/\` (Dune reads and deletes)
- Manage the project board: \`get-board\`, \`create-item\`, \`move-item\`, \`add-task\`, \`update-task\`
`;

function createIpcDir(
  homeDir: string,
  projectId: string,
  agentName: string,
): string {
  const ipcDir = path.join(homeDir, '.dune', 'projs', projectId, 'agents', agentName, 'ipc');

  fs.mkdirSync(path.join(ipcDir, 'agent'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'host'), { recursive: true });

  const claudeMdTarget = path.join(ipcDir, 'CLAUDE.md');
  fs.writeFileSync(claudeMdTarget, createIpcClaudeMd(projectId));

  return ipcDir;
}

function appendIpcSectionToGroupClaudeMd(
  runtimeRoot: string,
  groupFolder: string,
): void {
  try {
    const groupClaudeMd = path.join(runtimeRoot, 'agents', groupFolder, 'groups', 'main', 'CLAUDE.md');
    if (fs.existsSync(groupClaudeMd)) {
      const content = fs.readFileSync(groupClaudeMd, 'utf-8');
      if (!content.includes('## Dune IPC')) {
        fs.appendFileSync(groupClaudeMd, IPC_GROUP_CLAUDE_MD_SECTION);
      }
    }
  } catch {
    // non-critical
  }
}

export class AgentLiteHost implements AgentRuntime {
  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly pendingAssistantMessages = new Map<string, PendingAssistantMessage>();

  private readonly persistedAgents = new Map<string, PersistedAgentRecord>();

  private readonly agentRuntimes = new Map<string, DuneAgent>();

  private readonly agentRuntimeStarts = new Map<string, Promise<DuneAgent>>();

  private readonly agentStore: AgentStore;

  private readonly homeDir: string;

  private readonly onIpcDirCreated: AgentLiteHostOptions['onIpcDirCreated'];

  private readonly runtimeRoot: string;

  private agentLite: AgentLite | null = null;

  private agentLiteStartPromise: Promise<AgentLite> | null = null;

  private readonly loadAgentLiteModule: () => Promise<typeof import('@boxlite-ai/agentlite')>;

  private readonly resolveModelCredentials: () => Promise<Record<string, string>>;

  private readonly telegram: TelegramBridge;

  private startupModelCredentials: Record<string, string> = {};

  private snapshot: AgentServiceSnapshot;

  private shutdownPromise: Promise<void> | null = null;

  private blockedMessage: string | null = null;

  readonly service: AgentService;

  constructor(options: AgentLiteHostOptions) {
    this.agentStore = options.agentStore;
    this.homeDir = options.homeDir ?? os.homedir();
    this.onIpcDirCreated = options.onIpcDirCreated;
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.now = options.now ?? Date.now;
    this.loadAgentLiteModule =
      options.loadAgentLiteModule ??
      (() => import('@boxlite-ai/agentlite'));
    this.resolveModelCredentials =
      options.resolveModelCredentials ??
      (() => Promise.resolve({} satisfies Record<string, string>));
    this.telegram = new TelegramBridge({
      callbacks: {
        getAgents: () => this.snapshot.agents,
        now: () => this.now(),
        onChange: () => this.applyTelegramPatches(),
        onInboundMessage: (agentId, opts) =>
          this.dispatchAgentInput(agentId, opts),
      },
      createChannelFactory:
        options.createTelegramChannelFactory ??
        (async (token: string) => {
          const { telegram } = await importTelegramModule(
            '@boxlite-ai/agentlite/channels/telegram',
          );
          return telegram({ token });
        }),
      resolveBotUsername:
        options.resolveTelegramBotUsername ??
        (async (token: string) => {
          const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);

          if (!response.ok) {
            throw new Error(`Telegram getMe failed with ${response.status}.`);
          }

          const payload = await response.json() as {
            ok?: boolean;
            result?: { username?: string };
          };

          return payload.ok ? payload.result?.username ?? null : null;
        }),
      secretsStore: options.telegramSecretsStore ?? {
        delete: async () => undefined,
        get: async () => null,
        set: async () => undefined,
      },
    });
    this.snapshot = {
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot),
      selectedAgentId: null,
      telegramSetupSessions: [],
    };
    this.service = {
      cancelTelegramSetupSession: async (sessionId) => {
        this.assertWritableRuntime();
        await this.telegram.cancelSetupSession(sessionId);
      },
      createAgent: async (input) => this.createAgent(input),
      deleteAgent: async (agentId) => this.deleteAgent(agentId),
      ensureProjectMainAgent: async (projectId, projectName) =>
        this.ensureProjectMainAgent(projectId, projectName),
      getTelegramSetupSession: async (sessionId) =>
        this.telegram.getSetupSession(sessionId),
      getSnapshot: () => this.getSnapshot(),
      listAgents: () => this.getSnapshot().agents,
      selectAgent: (agentId) => {
        this.selectAgent(agentId);
      },
      sendMessage: async (agentId, text) => this.sendMessage(agentId, text),
      startTelegramSetupSession: async (input) => {
        this.assertWritableRuntime();
        return this.telegram.startSetupSession(input);
      },
      subscribe: (listener) => this.subscribe(listener),
    };
  }

  getSnapshot() {
    return cloneSnapshot(this.snapshot);
  }

  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start() {
    await this.loadPersistedState();

    const persistedAgentValidationError = this.validatePersistedAgents();

    if (persistedAgentValidationError) {
      this.blockRuntime(persistedAgentValidationError);
      return;
    }

    const credentials = await this.resolveModelCredentials();
    this.startupModelCredentials = { ...credentials };
    await this.ensureAgentLiteReady();

    for (const record of this.persistedAgents.values()) {
      try {
        await this.ensureAgentRuntime(record);
      } catch (error) {
        console.error(
          `Failed to start agent runtime for "${record.agent.name}" (${record.agent.id}).`,
          error,
        );
      }
    }

    this.snapshot = {
      ...this.snapshot,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
        message: createRuntimeReadyMessage(credentials),
        status: 'ready',
      }),
    };
    this.emit();
    await this.reloadExternalChannels();
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.clearPendingAssistantMessages();
      this.telegram.clearAllSetupSessions();

      try {
        await this.telegram.disconnectAll();
        await this.agentLite?.stop();
      } finally {
        this.agentLite = null;
        this.agentLiteStartPromise = null;
        this.agentRuntimes.clear();
        this.agentRuntimeStarts.clear();
      }
    })();

    return this.shutdownPromise;
  }

  async reloadExternalChannels() {
    await this.telegram.refreshRuntimeState({ forceReconnect: true });
  }

  reset() {
    this.clearPendingAssistantMessages();
    this.telegram.reset();
    this.persistedAgents.clear();
    this.agentRuntimes.clear();
    this.agentRuntimeStarts.clear();
    this.snapshot = {
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
        message: this.blockedMessage ?? 'AgentLite runtime state was cleared in-process.',
        status: this.blockedMessage ? 'error' : this.agentLite ? 'ready' : 'starting',
      }),
      selectedAgentId: null,
      telegramSetupSessions: [],
    };
    this.persistState();
    this.emit();
    void this.telegram.disconnectAll();
  }

  // -------------------------------------------------------------------------
  // Agent CRUD
  // -------------------------------------------------------------------------

  private async createAgent(input: CreateAgentInput) {
    this.assertWritableRuntime();

    const trimmedName = input.name.trim();
    const projectId = input.projectId?.trim() ?? '';

    if (!trimmedName) {
      throw new Error('Agent name is required.');
    }

    if (!projectId) {
      throw new Error('Project id is required.');
    }

    let telegramState: TelegramAgentRuntimeState | null = null;
    let externalTarget = input.externalTarget ?? null;
    const setupSessionId = input.telegramSetupSessionId?.trim() ?? '';
    const telegramSetupSession = setupSessionId
      ? this.telegram.getSetupSessionRecord(setupSessionId)
      : null;

    if (input.channelId === 'telegram') {
      if (!telegramSetupSession?.matchedChat) {
        throw new Error('Telegram pairing must finish before creating the agent.');
      }

      if (telegramSetupSession.status !== 'connected') {
        throw new Error('Telegram is not connected.');
      }

      externalTarget = telegramSetupSession.matchedChat;
      telegramState = createDefaultTelegramAgentRuntimeState({
        botUsername: telegramSetupSession.botUsername,
        boundChat: telegramSetupSession.matchedChat,
        errorMessage: telegramSetupSession.errorMessage,
        status: telegramSetupSession.status,
      });
    } else if (input.channelId !== 'dune-chat') {
      throw new Error(`${input.channelId} is not available yet.`);
    }

    const now = this.now();
    const agentId = createAgentId();
    const groupFolder = createGroupFolder(trimmedName, agentId);
    const nextAgent = createDraftAgent(
      agentId,
      trimmedName,
      now,
      input.channelId,
      telegramState,
      externalTarget,
      projectId,
      'custom',
    );

    const persistedRecord = { agent: nextAgent, groupFolder };
    this.persistedAgents.set(agentId, persistedRecord);
    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
      selectedAgentId: agentId,
    };
    this.persistState();
    this.emit();

    try {
      if (input.channelId === 'telegram' && telegramSetupSession) {
        await this.telegram.writeAgentToken(agentId, telegramSetupSession.token);
        this.telegram.consumeSetupSession(telegramSetupSession.id);
        await this.telegram.refreshRuntimeState();
      }

      await this.ensureAgentRuntime(persistedRecord);
    } catch (error) {
      console.error(`Failed to start agent runtime for "${trimmedName}".`, error);
      if (input.channelId === 'telegram') {
        await this.telegram.deleteAgentToken(agentId);
        await this.telegram.refreshRuntimeState();
      }
      this.rollbackOptimisticAgent(agentId);
      throw error;
    }

    return agentId;
  }

  private async ensureProjectMainAgent(projectId: string, projectName: string) {
    this.assertWritableRuntime();

    const trimmedProjectId = projectId.trim();
    const trimmedProjectName = projectName.trim();

    if (!trimmedProjectId) {
      throw new Error('Project id is required.');
    }

    if (!trimmedProjectName) {
      throw new Error('Project name is required.');
    }

    const existingAgent = this.snapshot.agents.find((agent) =>
      agent.projectId === trimmedProjectId && agent.role === 'project-main',
    ) ?? null;
    const expectedName = createProjectMainAgentName(trimmedProjectId);

    if (existingAgent) {
      if (existingAgent.name !== expectedName) {
        const persistedRecord = this.persistedAgents.get(existingAgent.id);

        this.snapshot = {
          ...this.snapshot,
          agents: this.snapshot.agents.map((agent) =>
            agent.id === existingAgent.id
              ? {
                  ...agent,
                  name: expectedName,
                  updatedAt: this.now(),
                }
              : agent,
          ),
        };

        if (persistedRecord) {
          persistedRecord.agent = {
            ...persistedRecord.agent,
            name: expectedName,
            updatedAt: this.now(),
          };
        }

        this.persistState();
        this.emit();
      }

      return existingAgent.id;
    }

    const now = this.now();
    const agentId = createAgentId();
    const nextAgent = createDraftAgent(
      agentId,
      expectedName,
      now,
      'dune-chat',
      null,
      null,
      trimmedProjectId,
      'project-main',
    );
    const persistedRecord = {
      agent: nextAgent,
      groupFolder: createGroupFolder(expectedName, agentId),
    } satisfies PersistedAgentRecord;

    this.persistedAgents.set(agentId, persistedRecord);
    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
    };
    this.persistState();
    this.emit();

    try {
      await this.ensureAgentRuntime(persistedRecord);
    } catch (error) {
      console.error(`Failed to start project main agent for "${expectedName}".`, error);
      this.rollbackOptimisticAgent(agentId);
      throw error;
    }

    return agentId;
  }

  private async deleteAgent(agentId: string) {
    if (!this.persistedAgents.has(agentId)) {
      return;
    }

    this.clearPendingAssistantMessage(agentId);
    const deletedRecord = this.persistedAgents.get(agentId)!;
    const deletedAgent = deletedRecord.agent;
    this.persistedAgents.delete(agentId);

    const duneAgent = this.agentRuntimes.get(agentId);

    if (duneAgent) {
      this.agentRuntimes.delete(agentId);
      await this.agentLite?.deleteAgent(deletedRecord.groupFolder);
    }

    const nextAgents = this.snapshot.agents.filter((agent) => agent.id !== agentId);
    const nextSelectedAgentId = this.snapshot.selectedAgentId === agentId
      ? nextAgents[0]?.id ?? null
      : this.snapshot.selectedAgentId;

    this.telegram.clearAgentSetupSessions(agentId);

    if (deletedAgent.channel.id === 'telegram') {
      await this.telegram.deleteAgentToken(agentId);
      this.telegram.deleteAgentFingerprint(agentId);
    }

    this.snapshot = {
      ...this.snapshot,
      agents: nextAgents,
      isStreaming: this.pendingAssistantMessages.size > 0,
      selectedAgentId: nextSelectedAgentId,
      telegramSetupSessions: this.telegram.listSetupSessions(),
    };
    this.persistState();
    this.emit();
    await this.telegram.refreshRuntimeState();
  }

  private selectAgent(agentId: string) {
    const agentExists = this.snapshot.agents.some((agent) => agent.id === agentId);

    if (!agentExists) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      selectedAgentId: agentId,
    };
    this.persistState();
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private async sendMessage(agentId: string, text: string) {
    this.assertWritableRuntime();

    const trimmedText = text.trim();

    if (!trimmedText || this.pendingAssistantMessages.has(agentId)) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId);

    if (!agent || !agent.channel.canCompose) {
      return;
    }

    await this.dispatchAgentInput(agentId, {
      attachmentSources: [],
      format: 'markdown',
      rawText: trimmedText,
      transcriptText: trimmedText,
      selectAgent: true,
      senderName: 'You',
      timestamp: this.now(),
    });
  }

  private async dispatchAgentInput(
    agentId: string,
    options: {
      attachmentSources: string[];
      format: AgentMessage['format'];
      rawText: string;
      senderName: string;
      selectAgent: boolean;
      timestamp: number;
      transcriptText: string;
    },
  ) {
    const persistedRecord = this.persistedAgents.get(agentId);

    if (!persistedRecord) {
      throw new Error(`Agent runtime "${agentId}" is unavailable.`);
    }

    const duneAgent = this.agentRuntimes.get(agentId)
      ?? await this.ensureAgentRuntime(persistedRecord);

    const assistantMessage = createAssistantMessage(options.timestamp);
    const attachments = normalizeAgentAttachments(options.attachmentSources, {
      groupFolder: persistedRecord.groupFolder,
      runtimeRoot: this.runtimeRoot,
    });
    const userMessage = {
      ...createUserMessage(options.transcriptText, options.timestamp),
      attachments,
      format: options.format,
    } satisfies AgentMessage;

    this.pendingAssistantMessages.set(agentId, {
      idleTimer: null,
      messageId: assistantMessage.id,
      safetyTimer: globalThis.setTimeout(() => {
        this.finalizeAssistantMessage(agentId);
      }, STREAMING_SAFETY_TIMEOUT_MS),
    });

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              messages: [...item.messages, userMessage, assistantMessage],
              preview: summarizePreview(options.transcriptText),
              status: 'live',
              updatedAt: options.timestamp,
            }
          : item,
      ),
      isStreaming: true,
      selectedAgentId: options.selectAgent ? agentId : this.snapshot.selectedAgentId,
    };
    this.persistState();
    this.emit();

    await duneAgent.pushUserMessage(agentId, options.rawText, options.senderName);
  }

  private handleOutboundMessage(agentId: string, text: string) {
    const pending = this.pendingAssistantMessages.get(agentId);
    const now = this.now();

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => {
        if (agent.id !== agentId) {
          return agent;
        }

        if (!pending) {
          return {
            ...agent,
            messages: [
              ...agent.messages,
              {
                attachments: [],
                content: text,
                createdAt: now,
                format: 'markdown',
                id: createMessageId('assistant', now),
                role: 'assistant',
                status: 'complete',
              },
            ],
            preview: summarizePreview(text),
            status: 'ready',
            updatedAt: now,
          };
        }

        return {
          ...agent,
          messages: agent.messages.map((message) =>
            message.id === pending.messageId
              ? {
                  ...message,
                  content:
                    text.startsWith(message.content)
                      ? text
                      : `${message.content}${text}`,
                  status: 'streaming',
                }
              : message,
          ),
          preview: summarizePreview(text),
          status: 'live',
          updatedAt: now,
        };
      }),
      isStreaming: this.pendingAssistantMessages.size > 0,
    };

    this.scheduleFinalizeAssistantMessage(agentId);
    this.persistState();
    this.emit();
  }

  private scheduleFinalizeAssistantMessage(agentId: string) {
    const pending = this.pendingAssistantMessages.get(agentId);

    if (!pending) {
      this.snapshot = {
        ...this.snapshot,
        isStreaming: this.pendingAssistantMessages.size > 0,
      };
      return;
    }

    if (pending.idleTimer) {
      globalThis.clearTimeout(pending.idleTimer);
    }

    pending.idleTimer = globalThis.setTimeout(() => {
      this.finalizeAssistantMessage(agentId);
    }, STREAMING_IDLE_WINDOW_MS);
  }

  private finalizeAssistantMessage(agentId: string) {
    const pending = this.pendingAssistantMessages.get(agentId);

    if (!pending) {
      return;
    }

    if (pending.idleTimer) {
      globalThis.clearTimeout(pending.idleTimer);
    }

    if (pending.safetyTimer) {
      globalThis.clearTimeout(pending.safetyTimer);
    }

    const now = this.now();

    this.pendingAssistantMessages.delete(agentId);

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              messages: agent.messages.map((message) =>
                message.id === pending.messageId
                  ? {
                      ...message,
                      status: 'complete',
                    }
                  : message,
              ),
              status: 'ready',
              updatedAt: now,
            }
          : agent,
      ),
      isStreaming: this.pendingAssistantMessages.size > 0,
    };
    this.persistState();
    this.emit();

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;
    const completedMessage = agent?.messages.find((message) => message.id === pending.messageId);

    if (
      agent?.channel.id === 'telegram'
      && agent.channel.target
      && completedMessage?.content
    ) {
      this.telegram.sendReply(agent.id, agent.channel.target.jid, completedMessage.content);
    }
  }

  // -------------------------------------------------------------------------
  // Telegram patch application
  // -------------------------------------------------------------------------

  private applyTelegramPatches() {
    const patches = this.telegram.syncAgentPatches();

    if (patches.length > 0) {
      const patchMap = new Map(patches.map((p) => [p.agentId, p]));

      this.snapshot = {
        ...this.snapshot,
        agents: this.snapshot.agents.map((agent) => {
          const patch = patchMap.get(agent.id);
          return patch
            ? {
                ...agent,
                channel: patch.channel,
                note: patch.note,
                preview: patch.preview,
                telegram: patch.telegram,
              }
            : agent;
        }),
      };
    }

    this.snapshot = {
      ...this.snapshot,
      telegramSetupSessions: this.telegram.listSetupSessions(),
    };
    this.persistState();
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Runtime lifecycle
  // -------------------------------------------------------------------------

  private assertWritableRuntime() {
    if (this.blockedMessage) {
      throw new Error(this.blockedMessage);
    }
  }

  private blockRuntime(message: string) {
    this.blockedMessage = message;
    this.snapshot = {
      ...this.snapshot,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
        message,
        status: 'error',
      }),
    };
    this.emit();
  }

  private validatePersistedAgents() {
    const unscopedAgents = [...this.persistedAgents.values()]
      .filter((record) => record.agent.projectId === null)
      .map((record) => record.agent.id);

    if (unscopedAgents.length > 0) {
      return [
        'Legacy Dune agent state contains agents without project ownership.',
        `Affected agents: ${unscopedAgents.join(', ')}.`,
        'Automatic migration is disabled. Clear or fix the persisted Dune agent state before restarting.',
      ].join(' ');
    }

    return null;
  }

  private async ensureAgentLiteReady(): Promise<AgentLite> {
    if (this.agentLite) {
      return this.agentLite;
    }

    if (this.shutdownPromise) {
      throw new Error('AgentLite runtime is shutting down.');
    }

    const inFlight = this.agentLiteStartPromise;

    if (inFlight) {
      return inFlight;
    }

    const startPromise = (async () => {
      const agentLiteModule = await this.loadAgentLiteModule();
      let lastError: unknown = null;

      for (let attempt = 0; attempt < AGENTLITE_LOCK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          const agentLite = await agentLiteModule.createAgentLite({
            workdir: this.runtimeRoot,
          });
          this.agentLite = agentLite;
          return agentLite;
        } catch (error) {
          lastError = error;

          if (
            !isAgentLiteRuntimeLockError(error)
            || attempt === AGENTLITE_LOCK_RETRY_ATTEMPTS - 1
          ) {
            throw error;
          }

          await waitForTimeout(AGENTLITE_LOCK_RETRY_DELAY_MS);
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    })();

    this.agentLiteStartPromise = startPromise;

    try {
      return await startPromise;
    } finally {
      if (this.agentLiteStartPromise === startPromise) {
        this.agentLiteStartPromise = null;
      }
    }
  }

  private async ensureAgentRuntime(record: PersistedAgentRecord): Promise<DuneAgent> {
    const agentId = record.agent.id;
    const existing = this.agentRuntimes.get(agentId);

    if (existing) {
      return existing;
    }

    const inFlight = this.agentRuntimeStarts.get(agentId);

    if (inFlight) {
      return inFlight;
    }

    const startPromise = (async () => {
      const agentLite = this.agentLite ?? await this.ensureAgentLiteReady();
      let ipcHostPath: string | undefined;
      if (record.agent.projectId) {
        try {
          ipcHostPath = createIpcDir(this.homeDir, record.agent.projectId, record.agent.name);
        } catch (error) {
          console.error(`Failed to create IPC directory for "${record.agent.name}".`, error);
        }
      }

      const duneAgent = new DuneAgent({
        agentLite,
        credentials: () => Promise.resolve({ ...this.startupModelCredentials }),
        groupFolder: record.groupFolder,
        ...(ipcHostPath ? { ipcHostPath } : {}),
        name: record.agent.name,
        onOutboundMessage: (jid, text) => {
          this.handleOutboundMessage(jid, text);
        },
        primaryChatJid: agentId,
      });

      try {
        await duneAgent.start();
      } catch (error) {
        await this.cleanupFailedAgentRuntime(record);
        throw error;
      }

      appendIpcSectionToGroupClaudeMd(this.runtimeRoot, record.groupFolder);

      if (ipcHostPath && record.agent.projectId) {
        this.onIpcDirCreated?.(agentId, record.agent.name, record.agent.projectId, ipcHostPath);
      }

      if (!this.persistedAgents.has(agentId)) {
        await this.cleanupFailedAgentRuntime(record);
        throw new Error(`Agent runtime "${agentId}" was removed before startup completed.`);
      }

      this.agentRuntimes.set(agentId, duneAgent);
      return duneAgent;
    })();

    this.agentRuntimeStarts.set(agentId, startPromise);

    try {
      return await startPromise;
    } finally {
      if (this.agentRuntimeStarts.get(agentId) === startPromise) {
        this.agentRuntimeStarts.delete(agentId);
      }
    }
  }

  private rollbackOptimisticAgent(agentId: string) {
    this.persistedAgents.delete(agentId);
    this.agentRuntimes.delete(agentId);

    const nextAgents = this.snapshot.agents.filter((agent) => agent.id !== agentId);
    const nextSelectedAgentId = this.snapshot.selectedAgentId === agentId
      ? nextAgents[0]?.id ?? null
      : this.snapshot.selectedAgentId;

    this.snapshot = {
      ...this.snapshot,
      agents: nextAgents,
      selectedAgentId: nextSelectedAgentId,
    };
    this.persistState();
    this.emit();
  }

  private async cleanupFailedAgentRuntime(record: PersistedAgentRecord) {
    try {
      await this.agentLite?.deleteAgent(record.groupFolder);
    } catch (cleanupError) {
      console.error(
        `Failed to clean up agent runtime for "${record.agent.name}" after startup failed.`,
        cleanupError,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private async loadPersistedState() {
    try {
      const agents = (await this.agentStore.get<PersistedAgentRecord[]>('agents')) ?? [];
      const selectedAgentId = await this.agentStore.get<string | null>('selectedAgentId');

      this.persistedAgents.clear();

      for (const record of agents.map((item) => normalizePersistedAgentRecord(item, this.runtimeRoot))) {
        this.persistedAgents.set(record.agent.id, record);
      }

      const snapshotAgents = [...this.persistedAgents.values()].map((record) => record.agent);
      const hasSelectedAgent = selectedAgentId
        ? snapshotAgents.some((agent) => agent.id === selectedAgentId)
        : false;

      this.snapshot = {
        ...this.snapshot,
        agents: snapshotAgents,
        externalChannels: createDefaultExternalChannelsState(),
        selectedAgentId: hasSelectedAgent ? selectedAgentId : snapshotAgents[0]?.id ?? null,
        telegramSetupSessions: [],
      };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
          message: `AgentLite runtime recovered from an unreadable Dune state file: ${String(error)}`,
          status: 'starting',
        }),
      };
    }
  }

  private persistState() {
    for (const agent of this.snapshot.agents) {
      const record = this.persistedAgents.get(agent.id);

      if (record) {
        record.agent = {
          ...agent,
          channel: {
            ...agent.channel,
            target: agent.channel.target ? { ...agent.channel.target } : null,
          },
          contextCards: agent.contextCards.map((card) => ({ ...card })),
          messages: agent.messages.map((message) => ({
            ...message,
            attachments: message.attachments.map((attachment) => ({ ...attachment })),
          })),
          telegram: cloneTelegramAgentRuntimeState(agent.telegram),
        };
      }
    }

    void this.agentStore.set('agents', [...this.persistedAgents.values()]);
    void this.agentStore.set('selectedAgentId', this.snapshot.selectedAgentId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private clearPendingAssistantMessage(agentId: string) {
    const pending = this.pendingAssistantMessages.get(agentId);

    if (!pending) {
      return;
    }

    if (pending.idleTimer) {
      globalThis.clearTimeout(pending.idleTimer);
    }

    if (pending.safetyTimer) {
      globalThis.clearTimeout(pending.safetyTimer);
    }

    this.pendingAssistantMessages.delete(agentId);
  }

  private clearPendingAssistantMessages() {
    for (const pending of this.pendingAssistantMessages.values()) {
      if (pending.idleTimer) {
        globalThis.clearTimeout(pending.idleTimer);
      }
      if (pending.safetyTimer) {
        globalThis.clearTimeout(pending.safetyTimer);
      }
    }

    this.pendingAssistantMessages.clear();
  }

  private emit() {
    const nextSnapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(nextSnapshot);
    }
  }
}
