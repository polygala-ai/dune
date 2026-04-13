import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  AgentLite,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import type {
  Agent,
  AgentActivityEvent,
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelStatus,
  AgentExternalTarget,
  AgentMessage,
  AgentRole,
  AgentRuntimeInfo,
  CodingEngineEvent,
  CodingEngineStatus,
  CreateAgentInput,
  ExternalChannelsState,
  StartTelegramSetupSessionInput,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '../../renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
  createDefaultTelegramAgentRuntimeState,
  createDefaultExternalChannelsState,
} from '../../renderer/features/agents/model/channels';
import {
  createAgentId,
  toAgentChatJid,
  toAgentPathId,
} from '../../shared/agents/agent-id';
import { createProjectMainAgentName } from '../../shared/agents/project-main-name';
import {
  summarizeMessagePreview,
} from '../../shared/agents/message-content';
import {
  createReadyAssignmentsInboxSignalMessage,
  type ReadyAssignmentsInboxSignal,
} from '../../shared/agents/ready-assignments';
import { normalizeProjectRootPath } from '../../shared/workflow/project-artifacts';
import {
  normalizeAgentAttachments,
} from './agent-message-attachments';
import {
  createAgentIpcDirectoryMetadata,
  resolveAgentDuneDir,
  resolveAgentIpcDir,
  resolveAgentIpcMetadataPath,
  resolveProjectDuneDir,
} from '../shared/agent-ipc/ipc-directory';
import { DuneAgent } from './dune-agent';
import { TelegramBridge } from './telegram-bridge';
import type { TelegramSecretsStore } from './telegram-bridge';
import { detectCodingEngines } from './coding-engine-detect';

const STREAMING_IDLE_WINDOW_MS = 320;
const AGENTLITE_LOCK_RETRY_DELAY_MS = 250;
const AGENTLITE_LOCK_RETRY_ATTEMPTS = 20;

export interface AgentServiceSnapshot {
  agents: Agent[];
  codingEngines: CodingEngineStatus[];
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
  ensureProjectMainAgent: (
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) => Promise<string>;
  getTelegramSetupSession: (sessionId: string) => Promise<TelegramSetupSession | null>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  signalReadyAssignmentInbox: (
    agentId: string,
    signal: ReadyAssignmentsInboxSignal,
  ) => Promise<void>;
  startTelegramSetupSession: (input: StartTelegramSetupSessionInput) => Promise<string>;
  subscribe: (listener: AgentServiceListener) => () => void;
  updateAgentChannel: (input: UpdateAgentChannelInput) => Promise<void>;
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
  projectName?: string | null;
  projectRootPath?: string | null;
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
  onAgentIdle?: (agentId: string) => void;
  onIpcDirCreated?: (agentId: string, agentName: string, projectId: string, ipcHostPath: string) => void;
  resolveProjectName?: (projectId: string) => Promise<string | null>;
  resolveProjectRootPath?: (projectId: string) => Promise<string | null>;
  resolveModelCredentials?: () => Promise<Record<string, string>>;
  resolveTelegramBotUsername?: (token: string) => Promise<string | null>;
  telegramSecretsStore?: TelegramSecretsStore;
}

function cloneSnapshot(snapshot: AgentServiceSnapshot): AgentServiceSnapshot {
  return {
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      activityEvents: agent.activityEvents.map((event) => ({ ...event })),
      channel: {
        ...agent.channel,
        target: agent.channel.target ? { ...agent.channel.target } : null,
      },
      codingEngineEvents: agent.codingEngineEvents.map((event) => ({ ...event })),
      contextCards: agent.contextCards.map((card) => ({ ...card })),
      messages: agent.messages.map((message) => ({
        ...message,
        attachments: message.attachments.map((attachment) => ({ ...attachment })),
      })),
      projectId: agent.projectId ?? null,
      role: agent.role,
      telegram: cloneTelegramAgentRuntimeState(agent.telegram),
    })),
    codingEngines: snapshot.codingEngines.map((engine) => ({ ...engine })),
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
  homeDir: string,
  overrides: Partial<AgentRuntimeInfo> = {},
): AgentRuntimeInfo {
  return {
    artifactsPath: resolveArtifactsDir(homeDir),
    mode: 'real',
    rootPath: runtimeRoot,
    status: 'starting',
    ...overrides,
  };
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

function createBuiltInAgentCopy() {
  return {
    note: 'This agent is running inside the real AgentLite foundation that Dune now hosts directly in the desktop runtime.',
    preview: 'Ready for a first instruction.',
  };
}

function createExternalAgentCopy(attachedLabel: string) {
  return {
    note: `This agent is bound to ${attachedLabel} and mirrors its transcript through the Dune host.`,
    preview: `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
  };
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
  const attachedLabel = channel.target?.name ?? channel.label;
  const copy = channel.kind === 'built-in'
    ? createBuiltInAgentCopy()
    : createExternalAgentCopy(attachedLabel);

  return {
    channel,
    activityEvents: [],
    codingEngineEvents: [],
    contextCards: [],
    id: agentId,
    messages: [] satisfies AgentMessage[],
    name,
    note: copy.note,
    preview: copy.preview,
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
      activityEvents: Array.isArray(record.agent.activityEvents)
        ? record.agent.activityEvents.map((event) => ({ ...event }))
        : [],
      channel: {
        ...record.agent.channel,
        target: record.agent.channel.target ? { ...record.agent.channel.target } : null,
      },
      codingEngineEvents: Array.isArray(record.agent.codingEngineEvents)
        ? record.agent.codingEngineEvents.map((event) => ({ ...event }))
        : [],
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
    projectName: typeof record.projectName === 'string' && record.projectName.trim()
      ? record.projectName.trim()
      : null,
    projectRootPath: normalizeProjectRootPath(record.projectRootPath),
  };
}

export function resolveAgentLiteRuntimeRoot(homeDir: string = os.homedir()) {
  return path.join(homeDir, '.dune', 'agentlite');
}

import { readAgentInstructions, readIpcGuide, resolveArtifactsDir, seedArtifacts } from './artifacts';

function resolveSourcePath(...segments: string[]): string {
  // In dev (Vite), __dirname points to .vite/build/. Use process.cwd() which is the project root.
  // In packaged builds, resources are alongside the asar.
  const root = process.cwd();
  return path.resolve(root, 'src', 'shared', 'agent-ipc', ...segments);
}

const DUNE_SKILL_DIR = resolveSourcePath('dune');
const PROJECT_KICKOFF_SKILL_DIR = resolveSourcePath('dune-project-kickoff');
const DUNE_MCP_SERVER_DIR = resolveSourcePath('dune-mcp-server');

function createIpcLayout(
  homeDir: string,
  projectId: string,
  projectName: string | null,
  agentId: string,
  agentName: string,
  agentRole: AgentRole,
): { duneMountRoot: string; ipcDir: string } {
  const projectDir = resolveProjectDuneDir(homeDir, projectId, projectName);
  const agentDir = resolveAgentDuneDir(homeDir, projectId, projectName, agentName, agentId);
  const ipcDir = resolveAgentIpcDir(homeDir, projectId, projectName, agentName, agentId);

  fs.mkdirSync(path.join(ipcDir, 'agent'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'host'), { recursive: true });

  fs.writeFileSync(
    resolveAgentIpcMetadataPath(ipcDir),
    `${JSON.stringify(
      createAgentIpcDirectoryMetadata(projectId, agentId, agentName, projectName),
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(projectDir, 'CLAUDE.md'),
    readIpcGuide(projectId, {
      ipcMountPath: `/workspace/extra/dune/agents/${path.basename(agentDir)}/ipc/`,
      rootMountPath: '/workspace/extra/dune/',
    }, homeDir),
  );
  fs.writeFileSync(path.join(agentDir, 'CLAUDE.md'), readIpcGuide(projectId, {}, homeDir));

  if (projectName) {
    for (const agentPath of findAgentDuneDirs(homeDir, projectId, agentId)) {
      if (agentPath !== agentDir) {
        fs.rmSync(agentPath, { force: true, recursive: true });
      }
    }

    for (const projectPath of findProjectDuneDirs(homeDir, projectId)) {
      if (projectPath !== projectDir) {
        fs.rmSync(projectPath, { force: true, recursive: true });
      }
    }
  }

  return {
    duneMountRoot: agentRole === 'project-main' ? projectDir : agentDir,
    ipcDir,
  };
}

function sanitizeRuntimePathSegment(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function findProjectDuneDirs(
  homeDir: string,
  projectId: string,
): string[] {
  const projsDir = path.join(homeDir, '.dune', 'projs');

  if (!fs.existsSync(projsDir)) {
    return [];
  }

  const projectIdSegment = sanitizeRuntimePathSegment(projectId, 'project');
  const matchingProjectDirs: string[] = [];

  for (const entry of fs.readdirSync(projsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === projectIdSegment || entry.name.endsWith(`-${projectIdSegment}`)) {
      matchingProjectDirs.push(path.join(projsDir, entry.name));
    }
  }

  return matchingProjectDirs;
}

function findAgentDuneDirs(
  homeDir: string,
  projectId: string,
  agentId: string,
): string[] {
  const agentIdSegments = new Set([
    sanitizeRuntimePathSegment(agentId, 'agent'),
    sanitizeRuntimePathSegment(toAgentPathId(agentId), 'agent'),
  ]);
  const matchingAgentDirs: string[] = [];

  for (const projectDir of findProjectDuneDirs(homeDir, projectId)) {
    const agentsDir = path.join(projectDir, 'agents');

    if (!fs.existsSync(agentsDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (
        [...agentIdSegments].some((agentIdSegment) =>
          entry.name === agentIdSegment || entry.name.endsWith(`-${agentIdSegment}`),
        )
      ) {
        matchingAgentDirs.push(path.join(agentsDir, entry.name));
      }
    }
  }

  return matchingAgentDirs;
}


export class AgentLiteHost implements AgentRuntime {
  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly pendingAssistantMessages = new Map<string, PendingAssistantMessage>();

  private readonly pendingReadyInboxSignals = new Map<string, ReadyAssignmentsInboxSignal>();

  private readonly deliveredReadyInboxGenerations = new Map<string, number>();

  private readonly persistedAgents = new Map<string, PersistedAgentRecord>();

  private readonly agentRuntimes = new Map<string, DuneAgent>();

  private readonly agentRuntimeStarts = new Map<string, Promise<DuneAgent>>();

  private readonly agentStore: AgentStore;

  private readonly homeDir: string;

  private readonly onAgentIdle: AgentLiteHostOptions['onAgentIdle'];

  private readonly onIpcDirCreated: AgentLiteHostOptions['onIpcDirCreated'];

  private readonly runtimeRoot: string;

  private agentLite: AgentLite | null = null;

  private agentLiteStartPromise: Promise<AgentLite> | null = null;

  private readonly loadAgentLiteModule: () => Promise<typeof import('@boxlite-ai/agentlite')>;

  private readonly resolveProjectName: ((projectId: string) => Promise<string | null>) | null;

  private readonly resolveProjectRootPath: ((projectId: string) => Promise<string | null>) | null;

  private readonly resolveModelCredentials: () => Promise<Record<string, string>>;

  private readonly telegram: TelegramBridge;

  private readonly createTelegramChannelFactory: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;

  private startupModelCredentials: Record<string, string> = {};

  private snapshot: AgentServiceSnapshot;

  private shutdownPromise: Promise<void> | null = null;

  private blockedMessage: string | null = null;

  readonly service: AgentService;

  constructor(options: AgentLiteHostOptions) {
    this.agentStore = options.agentStore;
    this.homeDir = options.homeDir ?? os.homedir();
    this.onAgentIdle = options.onAgentIdle;
    this.onIpcDirCreated = options.onIpcDirCreated;
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.now = options.now ?? Date.now;
    this.loadAgentLiteModule =
      options.loadAgentLiteModule ??
      (() => import('@boxlite-ai/agentlite'));
    this.resolveProjectName = options.resolveProjectName ?? null;
    this.resolveProjectRootPath = options.resolveProjectRootPath ?? null;
    this.resolveModelCredentials =
      options.resolveModelCredentials ??
      (() => Promise.resolve({} satisfies Record<string, string>));
    this.createTelegramChannelFactory =
      options.createTelegramChannelFactory ??
      (async (token: string) => {
        const { telegram } = await importTelegramModule(
          '@boxlite-ai/agentlite/channels/telegram',
        );
        return telegram({ token });
      });
    this.telegram = new TelegramBridge({
      callbacks: {
        getAgents: () => this.snapshot.agents,
        now: () => this.now(),
        onChange: () => this.applyTelegramPatches(),
      },
      createChannelFactory: this.createTelegramChannelFactory,
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
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir),
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
      ensureProjectMainAgent: async (projectId, projectName, projectRootPath) =>
        this.ensureProjectMainAgent(projectId, projectName, projectRootPath),
      getTelegramSetupSession: async (sessionId) =>
        this.telegram.getSetupSession(sessionId),
      getSnapshot: () => this.getSnapshot(),
      listAgents: () => this.getSnapshot().agents,
      selectAgent: (agentId) => {
        this.selectAgent(agentId);
      },
      sendMessage: async (agentId, text) => this.sendMessage(agentId, text),
      signalReadyAssignmentInbox: async (agentId, signal) =>
        this.signalReadyAssignmentInbox(agentId, signal),
      startTelegramSetupSession: async (input) => {
        this.assertWritableRuntime();
        return this.telegram.startSetupSession(input);
      },
      subscribe: (listener) => this.subscribe(listener),
      updateAgentChannel: async (input) => {
        this.assertWritableRuntime();
        await this.updateAgentChannel(input);
      },
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
    seedArtifacts(this.homeDir);
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

    const codingEngines = await detectCodingEngines();

    this.snapshot = {
      ...this.snapshot,
      codingEngines,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
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
    this.pendingReadyInboxSignals.clear();
    this.deliveredReadyInboxGenerations.clear();
    this.telegram.reset();
    this.persistedAgents.clear();
    this.agentRuntimes.clear();
    this.agentRuntimeStarts.clear();
    this.snapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
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
    const projectName = input.projectName?.trim() || null;
    const projectRootPath = normalizeProjectRootPath(input.projectRootPath);

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

    const persistedRecord = {
      agent: nextAgent,
      groupFolder,
      projectName,
      projectRootPath,
    } satisfies PersistedAgentRecord;
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

  private async updateAgentChannel(input: UpdateAgentChannelInput) {
    const agentId = input.agentId.trim();
    const record = this.persistedAgents.get(agentId);

    if (!record) {
      throw new Error(`Agent "${input.agentId}" was not found.`);
    }

    if (input.channelId === 'telegram') {
      const setupSessionId = input.telegramSetupSessionId?.trim() ?? '';
      const setupSession = setupSessionId
        ? this.telegram.getSetupSessionRecord(setupSessionId)
        : null;

      if (!setupSession?.matchedChat) {
        throw new Error('Telegram pairing must finish before changing the channel.');
      }

      if (setupSession.status !== 'connected') {
        throw new Error('Telegram is not connected.');
      }

      const duneAgent = this.agentRuntimes.get(agentId)
        ?? await this.ensureAgentRuntime(record);
      const channelFactory = await this.createTelegramChannelFactory(setupSession.token);

      await duneAgent.attachExternalChannel(channelFactory, setupSession.matchedChat.jid);
      await this.telegram.writeAgentToken(agentId, setupSession.token);
      this.telegram.consumeSetupSession(setupSession.id);

      const telegramState = createDefaultTelegramAgentRuntimeState({
        botUsername: setupSession.botUsername,
        boundChat: setupSession.matchedChat,
        errorMessage: setupSession.errorMessage,
        pairingStatus: 'matched',
        status: setupSession.status,
      });
      const channel = createChannelBinding('telegram', telegramState, setupSession.matchedChat);
      const copy = createExternalAgentCopy(setupSession.matchedChat.name);

      this.snapshot = {
        ...this.snapshot,
        agents: this.snapshot.agents.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                channel,
                note: copy.note,
                preview: copy.preview,
                telegram: telegramState,
              }
            : agent
        ),
        telegramSetupSessions: this.telegram.listSetupSessions(),
      };
      this.persistState();
      this.emit();
      await this.telegram.refreshRuntimeState();
      return;
    }

    if (input.channelId !== 'dune-chat') {
      throw new Error(`${input.channelId} is not available yet.`);
    }

    const duneAgent = this.agentRuntimes.get(agentId)
      ?? await this.ensureAgentRuntime(record);

    await duneAgent.detachExternalChannel();
    this.telegram.clearAgentSetupSessions(agentId);

    const copy = createBuiltInAgentCopy();

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              channel: createChannelBinding('dune-chat', null),
              note: copy.note,
              preview: copy.preview,
              telegram: null,
            }
          : agent
      ),
      telegramSetupSessions: this.telegram.listSetupSessions(),
    };
    this.persistState();
    this.emit();
    await this.telegram.refreshRuntimeState();
  }

  private async ensureProjectMainAgent(
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) {
    this.assertWritableRuntime();

    const trimmedProjectId = projectId.trim();
    const trimmedProjectName = projectName.trim();
    const hasProjectRootPathOverride = projectRootPath !== undefined;
    const normalizedProjectRootPath = normalizeProjectRootPath(projectRootPath);

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
      const persistedRecord = this.persistedAgents.get(existingAgent.id);
      const shouldRefreshProjectRuntimes = Boolean(
        persistedRecord && (
          persistedRecord.projectName !== trimmedProjectName ||
          (
            hasProjectRootPathOverride &&
            persistedRecord.projectRootPath !== normalizedProjectRootPath
          )
        ),
      );

      if (persistedRecord && persistedRecord.projectName !== trimmedProjectName) {
        persistedRecord.projectName = trimmedProjectName;
      }

      if (persistedRecord && hasProjectRootPathOverride) {
        persistedRecord.projectRootPath = normalizedProjectRootPath;
      }

      if (existingAgent.name !== expectedName) {
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
          persistedRecord.projectName = trimmedProjectName;
          if (hasProjectRootPathOverride) {
            persistedRecord.projectRootPath = normalizedProjectRootPath;
          }
        }
      }

      if (persistedRecord) {
        this.persistState();
      }

      if (existingAgent.name !== expectedName) {
        this.emit();
      }

      if (shouldRefreshProjectRuntimes) {
        await this.refreshProjectAgentRuntimes(trimmedProjectId);
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
      projectName: trimmedProjectName,
      projectRootPath: normalizedProjectRootPath,
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
    this.pendingReadyInboxSignals.delete(agentId);
    this.deliveredReadyInboxGenerations.delete(agentId);
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

    this.cleanupDeletedAgentPaths(deletedAgent);

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

  private cleanupDeletedAgentPaths(agent: Agent): void {
    if (!agent.projectId) {
      return;
    }

    try {
      for (const agentDir of findAgentDuneDirs(this.homeDir, agent.projectId, agent.id)) {
        fs.rmSync(agentDir, { force: true, recursive: true });
      }

      const hasRemainingProjectAgents = [...this.persistedAgents.values()]
        .some((record) => record.agent.projectId === agent.projectId);

      if (hasRemainingProjectAgents) {
        return;
      }

      for (const projectDir of findProjectDuneDirs(this.homeDir, agent.projectId)) {
        fs.rmSync(projectDir, { force: true, recursive: true });
      }
    } catch (error) {
      console.error(`Failed to clean up Dune filesystem paths for "${agent.name}".`, error);
    }
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

  private async signalReadyAssignmentInbox(
    agentId: string,
    signal: ReadyAssignmentsInboxSignal,
  ) {
    const itemCount = Math.max(0, signal.itemCount);

    if (itemCount === 0) {
      this.pendingReadyInboxSignals.delete(agentId);
      return;
    }

    const normalizedSignal = {
      generation: signal.generation,
      itemCount,
    } satisfies ReadyAssignmentsInboxSignal;
    const deliveredGeneration = this.deliveredReadyInboxGenerations.get(agentId) ?? 0;
    const pendingGeneration = this.pendingReadyInboxSignals.get(agentId)?.generation ?? 0;

    if (
      normalizedSignal.generation <= deliveredGeneration
      || normalizedSignal.generation <= pendingGeneration
    ) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;

    if (!agent?.channel.canCompose || !this.persistedAgents.has(agentId)) {
      return;
    }

    if (this.pendingAssistantMessages.has(agentId)) {
      this.pendingReadyInboxSignals.set(agentId, normalizedSignal);
      return;
    }

    await this.dispatchReadyAssignmentInboxSignal(agentId, normalizedSignal);
  }

  private async dispatchReadyAssignmentInboxSignal(
    agentId: string,
    signal: ReadyAssignmentsInboxSignal,
  ) {
    const persistedRecord = this.persistedAgents.get(agentId);

    if (!persistedRecord) {
      return;
    }

    const duneAgent = this.agentRuntimes.get(agentId)
      ?? await this.ensureAgentRuntime(persistedRecord);

    this.pendingReadyInboxSignals.delete(agentId);
    this.deliveredReadyInboxGenerations.set(agentId, signal.generation);

    await duneAgent.pushControlMessage(
      toAgentChatJid(agentId),
      createReadyAssignmentsInboxSignalMessage(signal),
    );
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
      safetyTimer: null,
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

    await duneAgent.pushUserMessage(
      toAgentChatJid(agentId),
      options.rawText,
      options.senderName,
    );
  }

  private handleExternalInboundMessage(agentId: string, text: string, senderName: string) {
    const now = this.now();
    const transcriptText = senderName !== 'External'
      ? `${senderName}: ${text}`
      : text;
    const userMessage = {
      ...createUserMessage(transcriptText, now),
      format: 'plain' as const,
    };

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              messages: [...agent.messages, userMessage],
              preview: summarizePreview(transcriptText),
              updatedAt: now,
            }
          : agent,
      ),
    };
    this.persistState();
    this.emit();
  }

  private handleOutboundMessage(chatJid: string, text: string) {
    const agentId = this.resolveAgentIdByChatJid(chatJid);

    if (!agentId) {
      return;
    }

    const pending = this.pendingAssistantMessages.get(agentId);
    const now = this.now();

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => {
        if (agent.id !== agentId) {
          return agent;
        }

        if (!pending) {
          // No pending message — start a new streaming assistant message
          // so subsequent chunks from AgentLite append to it.
          const newMessageId = createMessageId('assistant', now);
          this.pendingAssistantMessages.set(agentId, {
            idleTimer: null,
            messageId: newMessageId,
            safetyTimer: null,
          });

          return {
            ...agent,
            messages: [
              ...agent.messages,
              {
                attachments: [],
                content: text,
                createdAt: now,
                format: 'markdown',
                id: newMessageId,
                role: 'assistant',
                status: 'streaming',
              },
            ],
            preview: summarizePreview(text),
            status: 'live',
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

  private pushActivityEvent(agentId: string, event: AgentActivityEvent) {
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => {
        if (agent.id !== agentId) {
          return agent;
        }

        return {
          ...agent,
          activityEvents: [...agent.activityEvents, event],
          updatedAt: this.now(),
        };
      }),
    };
    this.emit();
  }

  pushCodingEngineEvent(agentId: string, event: CodingEngineEvent) {
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => {
        if (agent.id !== agentId) {
          return agent;
        }

        return {
          ...agent,
          codingEngineEvents: [...agent.codingEngineEvents, event],
          updatedAt: this.now(),
        };
      }),
    };
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
    this.onAgentIdle?.(agentId);

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;
    const completedMessage = agent?.messages.find((message) => message.id === pending.messageId);

    // Outbound Telegram delivery is handled by DuneChannel's external driver.

    const pendingReadyInboxSignal = this.pendingReadyInboxSignals.get(agentId) ?? null;

    if (pendingReadyInboxSignal) {
      void this.dispatchReadyAssignmentInboxSignal(agentId, pendingReadyInboxSignal);
    }
  }

  // -------------------------------------------------------------------------
  // Telegram patch application
  // -------------------------------------------------------------------------

  private async applyTelegramPatches() {
    const patches = this.telegram.syncAgentPatches();
    const previousAgentsById = new Map(this.snapshot.agents.map((agent) => [agent.id, agent]));

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

    for (const patch of patches) {
      const previousAgent = previousAgentsById.get(patch.agentId) ?? null;
      const previousTargetJid = previousAgent?.channel.target?.jid ?? null;
      const nextTargetJid = patch.channel.target?.jid ?? null;
      const shouldRebindExternalChannel = Boolean(
        nextTargetJid
        && (
          nextTargetJid !== previousTargetJid
          || patch.telegram.botUsername !== previousAgent?.telegram?.botUsername
        )
      );

      if (!shouldRebindExternalChannel) {
        continue;
      }

      const record = this.persistedAgents.get(patch.agentId);

      if (!record) {
        continue;
      }

      try {
        const duneAgent = this.agentRuntimes.get(patch.agentId)
          ?? await this.ensureAgentRuntime(record);
        const channelFactory = await this.resolveExternalChannelFactory(
          patch.channel.id,
          patch.agentId,
        );

        if (!channelFactory || !nextTargetJid) {
          await duneAgent.detachExternalChannel();
          continue;
        }

        await duneAgent.attachExternalChannel(channelFactory, nextTargetJid);
      } catch (error) {
        console.error(`Failed to rebind Telegram channel for "${patch.agentId}".`, error);
      }
    }
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
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
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

  private async resolveExternalChannelFactory(
    channelId: string,
    agentId: string,
  ): Promise<ChannelDriverFactory | null> {
    switch (channelId) {
      case 'telegram': {
        const token = await this.telegram.readAgentToken(agentId);
        return token ? await this.createTelegramChannelFactory(token) : null;
      }
      // Future channels: add cases here
      // case 'slack': { ... }
      // case 'whatsapp': { ... }
      // case 'discord': { ... }
      default:
        return null;
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
      let ipcContainerPath: string | undefined;
      const mounts: Array<{ containerPath: string; hostPath: string; readonly?: boolean }> = [];
      let didUpdateRecord = false;
      if (record.agent.projectId) {
        try {
          const resolvedProjectName = this.resolveProjectName
            ? await this.resolveProjectName(record.agent.projectId)
            : null;
          const resolvedProjectRootPath = this.resolveProjectRootPath
            ? await this.resolveProjectRootPath(record.agent.projectId)
            : null;
          const projectName = resolvedProjectName ?? record.projectName ?? null;
          const projectRootPath = normalizeProjectRootPath(
            resolvedProjectRootPath ?? record.projectRootPath,
          );
          if (record.projectName !== projectName) {
            record.projectName = projectName;
            didUpdateRecord = true;
          }
          if (record.projectRootPath !== projectRootPath) {
            record.projectRootPath = projectRootPath;
            didUpdateRecord = true;
          }
          const ipcLayout = createIpcLayout(
            this.homeDir,
            record.agent.projectId,
            projectName,
            record.agent.id,
            record.agent.name,
            record.agent.role,
          );
          ipcHostPath = ipcLayout.ipcDir;
          ipcContainerPath = `/workspace/extra/dune/${path.relative(ipcLayout.duneMountRoot, ipcLayout.ipcDir)}`;
          mounts.push({
            containerPath: 'dune',
            hostPath: ipcLayout.duneMountRoot,
            readonly: false,
          });

          if (projectRootPath) {
            mounts.push({
              containerPath: 'project',
              hostPath: path.resolve(projectRootPath),
              readonly: false,
            });
          }
        } catch (error) {
          console.error(`Failed to create IPC directory for "${record.agent.name}".`, error);
        }
      }

      let externalChannelFactory: ChannelDriverFactory | undefined;
      let boundExternalJid: string | undefined;

      // Wire external channel if the agent is bound to one
      if (record.agent.channel.target?.jid) {
        const channelFactory = await this.resolveExternalChannelFactory(
          record.agent.channel.id,
          agentId,
        );
        if (channelFactory) {
          externalChannelFactory = channelFactory;
          boundExternalJid = record.agent.channel.target.jid;
        }
      }

      const duneAgent = new DuneAgent({
        agentLite,
        boundExternalJid,
        credentials: () => Promise.resolve({ ...this.startupModelCredentials }),
        externalChannelFactory,
        groupFolder: record.groupFolder,
        instructions: readAgentInstructions(record.agent.role, this.homeDir),
        mcpServers: ipcHostPath ? {
          dune: {
            source: DUNE_MCP_SERVER_DIR,
            command: 'node',
            args: ['server.ts'],
            env: {
              DUNE_IPC_PATH: ipcContainerPath!,
              DUNE_CLAUDE_CODE_AVAILABLE: String(this.snapshot.codingEngines.some((e) => e.id === 'claude-code' && e.available)),
              DUNE_CODEX_AVAILABLE: String(this.snapshot.codingEngines.some((e) => e.id === 'codex' && e.available)),
            },
          },
        } : undefined,
        ...(mounts.length > 0 ? { mounts } : {}),
        name: record.agent.name,
        onExternalInbound: (text, senderName) => {
          this.handleExternalInboundMessage(agentId, text, senderName);
        },
        onOutboundMessage: (chatJid, text) => {
          this.handleOutboundMessage(chatJid, text);
        },
        primaryChatJid: toAgentChatJid(agentId),
        skills: record.agent.role === 'project-main'
          ? [DUNE_SKILL_DIR, PROJECT_KICKOFF_SKILL_DIR]
          : [DUNE_SKILL_DIR],
      });

      try {
        await duneAgent.start();
      } catch (error) {
        await this.cleanupFailedAgentRuntime(record);
        throw error;
      }

      // Subscribe to agent events for UI visibility.
      const alAgent = duneAgent.agentLiteAgent;

      alAgent.on('run.tool', (event) => {
        this.pushActivityEvent(agentId, {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'tool',
          label: event.toolName,
          detail: event.input,
          timestamp: Date.now(),
        });
      });

      alAgent.on('run.subagent', (event) => {
        this.pushActivityEvent(agentId, {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'subagent',
          label: `${event.subtype}: ${event.description}`,
          detail: event.summary,
          timestamp: Date.now(),
        });
      });

      alAgent.on('run.status', (event) => {
        this.pushActivityEvent(agentId, {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'status',
          label: event.status,
          timestamp: Date.now(),
        });
      });

      alAgent.on('run.sdk_message', (event) => {
        const msg = event.message;
        const sdkType = event.sdkType;
        const sdkSubtype = event.sdkSubtype;

        // Tool result feedback (user messages contain tool results)
        if (sdkType === 'user' && Array.isArray(msg?.message?.content)) {
          for (const block of msg.message.content as Array<Record<string, unknown>>) {
            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
              const output = typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? (block.content as Array<Record<string, unknown>>)
                      .filter((c) => c.type === 'text')
                      .map((c) => String(c.text ?? ''))
                      .join('\n')
                  : undefined;
              if (output) {
                this.pushActivityEvent(agentId, {
                  id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  kind: 'tool',
                  label: `result:${String(block.tool_use_id).slice(0, 8)}`,
                  detail: output.slice(0, 2000),
                  timestamp: Date.now(),
                });
              }
            }
          }
        }

        // Assistant text blocks (non-tool-use content)
        if (sdkType === 'assistant' && Array.isArray(msg?.message?.content)) {
          for (const block of msg.message.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              this.pushActivityEvent(agentId, {
                id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                kind: 'status',
                label: 'thinking',
                detail: String(block.text).slice(0, 2000),
                timestamp: Date.now(),
              });
            }
          }
        }

        // System status messages
        if (sdkType === 'system' && sdkSubtype === 'status' && msg?.status) {
          this.pushActivityEvent(agentId, {
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'status',
            label: String(msg.status),
            timestamp: Date.now(),
          });
        }
      });

      if (ipcHostPath && record.agent.projectId) {
        this.onIpcDirCreated?.(agentId, record.agent.name, record.agent.projectId, ipcHostPath);
      }

      if (didUpdateRecord) {
        this.persistState();
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

  private async refreshProjectAgentRuntimes(projectId: string) {
    const projectAgentRecords = [...this.persistedAgents.values()]
      .filter((record) => record.agent.projectId === projectId);

    for (const record of projectAgentRecords) {
      const agentId = record.agent.id;
      const hasRuntime = this.agentRuntimes.has(agentId);

      if (!hasRuntime) {
        continue;
      }

      this.clearPendingAssistantMessage(agentId);
      this.agentRuntimes.delete(agentId);

      try {
        await this.agentLite?.deleteAgent(record.groupFolder);
      } catch (error) {
        console.error(`Failed to refresh runtime mounts for "${record.agent.name}".`, error);
      }
    }

    for (const record of projectAgentRecords) {
      await this.ensureAgentRuntime(record);
    }
  }

  private rollbackOptimisticAgent(agentId: string) {
    this.persistedAgents.delete(agentId);
    this.agentRuntimes.delete(agentId);
    this.pendingReadyInboxSignals.delete(agentId);
    this.deliveredReadyInboxGenerations.delete(agentId);

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

  private resolveAgentIdByChatJid(chatJid: string): string | null {
    for (const record of this.persistedAgents.values()) {
      if (toAgentChatJid(record.agent.id) === chatJid) {
        return record.agent.id;
      }
    }

    return null;
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

  private cleanupPersistedAgentRuntimeState(record: PersistedAgentRecord) {
    try {
      fs.rmSync(path.join(this.runtimeRoot, 'agents', record.groupFolder), {
        force: true,
        recursive: true,
      });
      fs.rmSync(path.join(this.runtimeRoot, 'groups', record.groupFolder), {
        force: true,
        recursive: true,
      });
    } catch (error) {
      console.error(`Failed to remove orphaned runtime state for "${record.agent.name}".`, error);
    }
  }

  private async pruneOrphanedPersistedAgents() {
    if (!this.resolveProjectName) {
      return false;
    }

    const projectNameCache = new Map<string, string | null>();
    let didPrune = false;

    for (const [agentId, record] of [...this.persistedAgents.entries()]) {
      const projectId = record.agent.projectId;

      if (!projectId) {
        continue;
      }

      let projectName: string | null;
      if (projectNameCache.has(projectId)) {
        projectName = projectNameCache.get(projectId) ?? null;
      } else {
        projectName = await this.resolveProjectName(projectId);
        projectNameCache.set(projectId, projectName);
      }

      if (projectName !== null) {
        record.projectName = projectName;
        continue;
      }

      this.persistedAgents.delete(agentId);
      this.cleanupDeletedAgentPaths(record.agent);
      this.cleanupPersistedAgentRuntimeState(record);
      didPrune = true;
    }

    return didPrune;
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

      const didPruneOrphans = await this.pruneOrphanedPersistedAgents();

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

      if (didPruneOrphans) {
        this.persistState();
      }
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
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
          activityEvents: agent.activityEvents.map((event) => ({ ...event })),
          channel: {
            ...agent.channel,
            target: agent.channel.target ? { ...agent.channel.target } : null,
          },
          codingEngineEvents: agent.codingEngineEvents.map((event) => ({ ...event })),
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
