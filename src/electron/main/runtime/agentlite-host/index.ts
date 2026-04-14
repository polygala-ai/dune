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
} from '@/renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
  createDefaultTelegramAgentRuntimeState,
  createDefaultExternalChannelsState,
} from '@/renderer/features/agents/model/channels';
import {
  createAgentId,
  toAgentChatJid,
  toAgentPathId,
} from '@/shared/agents/agent-id';
import { createProjectMainAgentName } from '@/shared/agents/project-main-name';
import {
  summarizeMessagePreview,
} from '@/shared/agents/message-content';
import {
  createReadyAssignmentsInboxSignalMessage,
  type ReadyAssignmentsInboxSignal,
} from '@/shared/agents/ready-assignments';
import { normalizeProjectRootPath } from '@/shared/workflow/project-artifacts';
import {
  normalizeAgentAttachments,
} from '../agent-message-attachments';
import {
  createAgentIpcDirectoryMetadata,
  resolveAgentDuneDir,
  resolveAgentIpcDir,
  resolveAgentIpcMetadataPath,
  resolveProjectDuneDir,
} from '@/electron/main/agent-ipc/ipc-directory';
import { DuneAgent } from '../dune-agent';
import { TelegramBridge } from '../telegram-bridge';
import type { TelegramSecretsStore } from '../telegram-bridge';
import { detectCodingEngines } from '../coding-engine-detect';

import { createChannelBinding, mapTelegramChannelStatus } from './channels';
import {
  createAssistantMessage,
  createBuiltInAgentCopy,
  createDraftAgent,
  createExternalAgentCopy,
  createMessageId,
  createUserMessage,
  normalizePersistedAgentRecord,
  normalizePersistedMessages,
  summarizePreview,
  type PersistedAgentRecord,
} from './records';
import {
  createIpcLayout,
  findAgentDuneDirs,
  findProjectDuneDirs,
  resolveAgentLiteRuntimeRoot,
  sanitizeRuntimePathSegment,
  seedAgentIpcSources,
} from './paths';
import {
  cloneSnapshot,
  createRuntimeInfo,
  createRuntimeReadyMessage,
} from './snapshot';
import { createGroupFolder, isAgentLiteRuntimeLockError, waitForTimeout } from './utils';
import { ReadyInbox } from './ready-inbox';
import { MessageStream, type PendingAssistantMessage } from './message-stream';
import { Lifecycle } from './lifecycle';
import { AgentRecords } from './agent-records';

const STREAMING_IDLE_WINDOW_MS = 320;
const AGENTLITE_LOCK_RETRY_DELAY_MS = 250;
const AGENTLITE_LOCK_RETRY_ATTEMPTS = 20;

import type {
  AgentRuntime,
  AgentService,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/shared/agents/agent-runtime';

export { resolveAgentLiteRuntimeRoot } from './paths';
export type { AgentRuntime, AgentService, AgentServiceListener, AgentServiceSnapshot };

export interface AgentStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
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
  bundledAgentDir?: string;
  createTelegramChannelFactory?: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;
  homeDir?: string;
  loadAgentLiteModule?: () => Promise<typeof import('@boxlite-ai/agentlite')>;
  now?: () => number;
  onAgentIdle?: (agentId: string) => void;
  onIpcDirCreated?: (
    agentId: string,
    agentName: string,
    projectId: string,
    ipcHostPath: string,
    ipcContainerPath: string,
  ) => void;
  resolveProjectName?: (projectId: string) => Promise<string | null>;
  resolveProjectRootPath?: (projectId: string) => Promise<string | null>;
  resolveModelCredentials?: () => Promise<Record<string, string>>;
  resolveTelegramBotUsername?: (token: string) => Promise<string | null>;
  telegramSecretsStore?: TelegramSecretsStore;
}

import {
  readAgentInstructions,
  resolveBundledAgentDir,
  seedArtifacts,
} from '../artifacts';

export class AgentLiteHost implements AgentRuntime {
  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly messageStream = new MessageStream();

  private readonly readyInbox = new ReadyInbox();

  private readonly records = new AgentRecords();

  private readonly lifecycle = new Lifecycle();

  private readonly agentStore: AgentStore;

  private readonly homeDir: string;

  private readonly onAgentIdle: AgentLiteHostOptions['onAgentIdle'];

  private readonly onIpcDirCreated: AgentLiteHostOptions['onIpcDirCreated'];

  private readonly runtimeRoot: string;

  private readonly duneSkillDir: string;

  private readonly projectKickoffSkillDir: string;

  private readonly duneMcpServerDir: string;

  private readonly bundledAgentDir: string;

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
    this.bundledAgentDir = options.bundledAgentDir ?? resolveBundledAgentDir();
    const stagingDir = seedAgentIpcSources(this.bundledAgentDir, this.homeDir);
    this.duneSkillDir = path.join(stagingDir, 'dune');
    this.projectKickoffSkillDir = path.join(stagingDir, 'dune-project-kickoff');
    this.duneMcpServerDir = path.join(stagingDir, 'dune-mcp-server');
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
    seedArtifacts(this.homeDir, this.bundledAgentDir);
    await this.loadPersistedState();

    const persistedAgentValidationError = this.validatePersistedAgents();

    if (persistedAgentValidationError) {
      this.blockRuntime(persistedAgentValidationError);
      return;
    }

    const credentials = await this.resolveModelCredentials();
    this.startupModelCredentials = { ...credentials };
    await this.ensureAgentLiteReady();

    // Detect coding engines before starting agent runtimes so the env vars
    // passed to each agent's dune-mcp-server reflect real availability.
    // Otherwise the MCP server starts with DUNE_*_AVAILABLE='false' and never
    // registers the coding_engine_* tools.
    const codingEngines = await detectCodingEngines();
    this.snapshot = { ...this.snapshot, codingEngines };

    for (const record of this.records.values()) {
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
      this.messageStream.clear();
      this.telegram.clearAllSetupSessions();

      try {
        await this.telegram.disconnectAll();
      } finally {
        await this.lifecycle.stop();
      }
    })();

    return this.shutdownPromise;
  }

  async reloadExternalChannels() {
    await this.telegram.refreshRuntimeState({ forceReconnect: true });
  }

  reset() {
    this.messageStream.clear();
    this.readyInbox.clear();
    this.telegram.reset();
    this.records.clear();
    this.lifecycle.clearRuntimes();
    this.snapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
        message: this.blockedMessage ?? 'AgentLite runtime state was cleared in-process.',
        status: this.blockedMessage ? 'error' : this.lifecycle.isEngineReady() ? 'ready' : 'starting',
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
    this.records.set(persistedRecord);
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
    const record = this.records.get(agentId);

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

      const duneAgent = this.lifecycle.getRuntime(agentId)
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

    const duneAgent = this.lifecycle.getRuntime(agentId)
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
      const persistedRecord = this.records.get(existingAgent.id);
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

    this.records.set(persistedRecord);
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
    if (!this.records.has(agentId)) {
      return;
    }

    this.messageStream.forget(agentId);
    this.readyInbox.forget(agentId);
    const deletedRecord = this.records.get(agentId)!;
    const deletedAgent = deletedRecord.agent;
    this.records.delete(agentId);

    const duneAgent = this.lifecycle.getRuntime(agentId);

    if (duneAgent) {
      this.lifecycle.deleteRuntime(agentId);
      await this.lifecycle.deleteSdkAgent(deletedRecord.groupFolder);
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
      isStreaming: this.messageStream.isStreaming,
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

      const hasRemainingProjectAgents = [...this.records.values()]
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

    if (!trimmedText || this.messageStream.has(agentId)) {
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
      this.readyInbox.forget(agentId);
      return;
    }

    const normalizedSignal = {
      generation: signal.generation,
      itemCount,
    } satisfies ReadyAssignmentsInboxSignal;
    const deliveredGeneration = this.readyInbox.getDeliveredGeneration(agentId);
    const pendingGeneration = this.readyInbox.getPending(agentId)?.generation ?? 0;

    if (
      normalizedSignal.generation <= deliveredGeneration
      || normalizedSignal.generation <= pendingGeneration
    ) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;

    if (!agent?.channel.canCompose || !this.records.has(agentId)) {
      return;
    }

    if (this.messageStream.has(agentId)) {
      this.readyInbox.queue(agentId, normalizedSignal);
      return;
    }

    await this.dispatchReadyAssignmentInboxSignal(agentId, normalizedSignal);
  }

  private async dispatchReadyAssignmentInboxSignal(
    agentId: string,
    signal: ReadyAssignmentsInboxSignal,
  ) {
    const persistedRecord = this.records.get(agentId);

    if (!persistedRecord) {
      return;
    }

    const duneAgent = this.lifecycle.getRuntime(agentId)
      ?? await this.ensureAgentRuntime(persistedRecord);

    this.readyInbox.markDelivered(agentId, signal.generation);

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
    const persistedRecord = this.records.get(agentId);

    if (!persistedRecord) {
      throw new Error(`Agent runtime "${agentId}" is unavailable.`);
    }

    const duneAgent = this.lifecycle.getRuntime(agentId)
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

    this.messageStream.set(agentId, {
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

    const pending = this.messageStream.get(agentId);
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
          this.messageStream.set(agentId, {
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
      isStreaming: this.messageStream.isStreaming,
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
    const pending = this.messageStream.get(agentId);

    if (!pending) {
      this.snapshot = {
        ...this.snapshot,
        isStreaming: this.messageStream.isStreaming,
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
    const pending = this.messageStream.get(agentId);

    if (!pending) {
      return;
    }

    const now = this.now();

    this.messageStream.forget(agentId);

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
      isStreaming: this.messageStream.isStreaming,
    };
    this.persistState();
    this.emit();
    this.onAgentIdle?.(agentId);

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;
    const completedMessage = agent?.messages.find((message) => message.id === pending.messageId);

    // Outbound Telegram delivery is handled by DuneChannel's external driver.

    const pendingReadyInboxSignal = this.readyInbox.getPending(agentId);

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

      const record = this.records.get(patch.agentId);

      if (!record) {
        continue;
      }

      try {
        const duneAgent = this.lifecycle.getRuntime(patch.agentId)
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
    const unscopedAgents = [...this.records.values()]
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
    const existing = this.lifecycle.getEngine();
    if (existing) {
      return existing;
    }

    if (this.shutdownPromise) {
      throw new Error('AgentLite runtime is shutting down.');
    }

    const inFlight = this.lifecycle.getInFlightEngineStart();

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
          this.lifecycle.setEngine(agentLite);
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

    this.lifecycle.beginEngineStart(startPromise);

    try {
      return await startPromise;
    } finally {
      this.lifecycle.endEngineStart(startPromise);
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
    const existing = this.lifecycle.getRuntime(agentId);

    if (existing) {
      return existing;
    }

    const inFlight = this.lifecycle.getInFlightRuntimeStart(agentId);

    if (inFlight) {
      return inFlight;
    }

    const startPromise = (async () => {
      const agentLite = this.lifecycle.getEngine() ?? await this.ensureAgentLiteReady();
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
            source: this.duneMcpServerDir,
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
          ? [this.duneSkillDir, this.projectKickoffSkillDir]
          : [this.duneSkillDir],
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

      if (ipcHostPath && ipcContainerPath && record.agent.projectId) {
        this.onIpcDirCreated?.(
          agentId,
          record.agent.name,
          record.agent.projectId,
          ipcHostPath,
          ipcContainerPath,
        );
      }

      if (didUpdateRecord) {
        this.persistState();
      }

      if (!this.records.has(agentId)) {
        await this.cleanupFailedAgentRuntime(record);
        throw new Error(`Agent runtime "${agentId}" was removed before startup completed.`);
      }

      this.lifecycle.setRuntime(agentId, duneAgent);
      return duneAgent;
    })();

    this.lifecycle.beginRuntimeStart(agentId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.lifecycle.endRuntimeStart(agentId, startPromise);
    }
  }

  private async refreshProjectAgentRuntimes(projectId: string) {
    const projectAgentRecords = [...this.records.values()]
      .filter((record) => record.agent.projectId === projectId);

    for (const record of projectAgentRecords) {
      const agentId = record.agent.id;
      const hasRuntime = this.lifecycle.hasRuntime(agentId);

      if (!hasRuntime) {
        continue;
      }

      this.messageStream.forget(agentId);
      this.lifecycle.deleteRuntime(agentId);

      try {
        await this.lifecycle.deleteSdkAgent(record.groupFolder);
      } catch (error) {
        console.error(`Failed to refresh runtime mounts for "${record.agent.name}".`, error);
      }
    }

    for (const record of projectAgentRecords) {
      await this.ensureAgentRuntime(record);
    }
  }

  private rollbackOptimisticAgent(agentId: string) {
    this.records.delete(agentId);
    this.lifecycle.deleteRuntime(agentId);
    this.readyInbox.forget(agentId);

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
    for (const record of this.records.values()) {
      if (toAgentChatJid(record.agent.id) === chatJid) {
        return record.agent.id;
      }
    }

    return null;
  }

  private async cleanupFailedAgentRuntime(record: PersistedAgentRecord) {
    try {
      await this.lifecycle.deleteSdkAgent(record.groupFolder);
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

    for (const [agentId, record] of [...this.records.entries()]) {
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

      this.records.delete(agentId);
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

      this.records.clear();

      for (const record of agents.map((item) => normalizePersistedAgentRecord(item, this.runtimeRoot))) {
        this.records.set(record);
      }

      const didPruneOrphans = await this.pruneOrphanedPersistedAgents();

      const snapshotAgents = [...this.records.values()].map((record) => record.agent);
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
      const record = this.records.get(agent.id);

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

    void this.agentStore.set('agents', [...this.records.values()]);
    void this.agentStore.set('selectedAgentId', this.snapshot.selectedAgentId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private emit() {
    const nextSnapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(nextSnapshot);
    }
  }
}
