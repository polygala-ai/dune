// AgentLite-backed desktop runtime orchestration.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Agent as AgentLiteAgent,
  AgentLite,
  ChannelDriverFactory,
  RegisterGroupOptions,
} from '@boxlite-ai/agentlite';

import type {
  Agent,
  AgentActivityEvent,
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelStatus,
  AgentExternalTarget,
  AgentDefinition,
  AgentMessage,
  AgentMessageUsage,
  AgentTranscriptPage,
  AgentRuntimeInfo,
  AgentStatus,
  CodingEngineStatus,
  CreateAgentInput,
  ExternalChannelsState,
  RunIsolatedResearchInput,
  RunIsolatedResearchResult,
  StartTelegramSetupSessionInput,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import {
  cloneAgentDefinition,
  createDefaultAgentDefinition,
  normalizeAgentDefinition,
} from '@/renderer/features/agents/model/agent-definition';
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
  extractWorkspaceAttachmentPaths,
  summarizeMessagePreview,
} from '@/shared/agents/message-content';
import { normalizeProjectRootPath } from '@/shared/workflow/project-artifacts';
import {
  normalizeAgentAttachments,
} from '../agent-message-attachments';
import {
  findAgentDuneDirs,
  findProjectDuneDirs,
  resolveAgentLiteRuntimeRoot,
} from '@/electron/main/dune-paths';
import { auto as autoAcpPeers } from '@boxlite-ai/agentlite/acp/peers';
import { DuneAgent, type DuneAcpOptions } from '../dune-agent';
import {
  registerDuneActions,
  type ActionHostServices,
} from '@/electron/main/agent-actions/register-actions';
import {
  createWorkflowEvent,
  readWorkflowSnapshot,
  recordWorkflowItemEvents,
  type WorkflowItem,
  type WorkflowSnapshot,
  writeWorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import { TelegramBridge } from '../telegram-bridge';
import type { TelegramSecretsStore } from '../telegram-bridge';
import { detectCodingEngines } from '../coding-engine-detect';

import { createChannelBinding, mapTelegramChannelStatus } from './channels';
import {
  createAssistantMessage,
  createBuiltInAgentCopy,
  createDraftAgent,
  createAgentTranscriptSummary,
  createExternalAgentCopy,
  createMessageId,
  createPersistedTranscriptArchive,
  createUserMessage,
  normalizePersistedAgentRecord,
  normalizePersistedMessages,
  summarizePreview,
  type PersistedTranscriptArchive,
  type PersistedAgentRecord,
} from './records';
import {
  createDuneMountLayout,
  seedAgentSupportSources,
} from './paths';
import {
  cloneSnapshot,
  createRuntimeInfo,
  createRuntimeReadyMessage,
} from './snapshot';
import { createGroupFolder, isAgentLiteRuntimeLockError, waitForTimeout } from './utils';
import { MessageStream, type PendingAssistantMessage } from './message-stream';
import { Lifecycle } from './lifecycle';
import { AgentRecords } from './agent-records';

const STREAMING_IDLE_WINDOW_MS = 320;
const AGENTLITE_LOCK_RETRY_DELAY_MS = 250;
const AGENTLITE_LOCK_RETRY_ATTEMPTS = 20;
const MAX_ACTIVITY_EVENTS = 50;
const MAX_LIVE_TRANSCRIPT_MESSAGES = 40;
const MAX_ROLLING_SUMMARY_MESSAGES = 24;
const DEFAULT_TRANSCRIPT_PAGE_LIMIT = 80;
const MAX_TRANSCRIPT_PAGE_LIMIT = 200;
const DEFAULT_RESEARCH_CONCURRENCY = 4;
const MAX_RESEARCH_CONCURRENCY = 8;
const MAX_RESEARCH_TARGETS = 24;
const RESEARCH_RUN_TIMEOUT_MS = 3 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const TRANSCRIPT_SUMMARY_CARD_ID = 'transcript-rolling-summary';
const ISOLATED_RESEARCH_GROUP_FOLDER_PREFIX = 'isolated-research-slot-';

function cloneAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({ ...attachment })),
    ...(message.usage ? { usage: { ...message.usage } } : {}),
  };
}

function cloneAgentMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => cloneAgentMessage(message));
}

function clampTranscriptPageLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_TRANSCRIPT_PAGE_LIMIT;
  }

  return Math.max(1, Math.min(MAX_TRANSCRIPT_PAGE_LIMIT, Math.trunc(limit ?? DEFAULT_TRANSCRIPT_PAGE_LIMIT)));
}

function clampResearchConcurrency(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_RESEARCH_CONCURRENCY;
  }

  return Math.max(1, Math.min(MAX_RESEARCH_CONCURRENCY, Math.trunc(limit ?? DEFAULT_RESEARCH_CONCURRENCY)));
}

function roleLabel(role: AgentMessage['role']) {
  switch (role) {
    case 'assistant':
      return 'Agent';
    case 'system':
      return 'System';
    case 'user':
    default:
      return 'User';
  }
}

function buildRollingTranscriptSummary(messages: AgentMessage[]) {
  const summarizedMessages = messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_ROLLING_SUMMARY_MESSAGES)
    .map((message) => `- ${roleLabel(message.role)}: ${summarizeMessagePreview(message.content, 160)}`);

  if (summarizedMessages.length === 0) {
    return null;
  }

  return [
    `${messages.length} earlier transcript messages were compacted out of the live window.`,
    'Preserve the decisions, constraints, and unresolved questions captured here when you continue.',
    '',
    ...summarizedMessages,
  ].join('\n');
}

function appendArchivedTranscriptSummary(base: string, summary: string | null) {
  const trimmedSummary = summary?.trim() ?? '';

  if (!trimmedSummary) {
    return base;
  }

  const block = ['## Archived Conversation Summary', trimmedSummary].join('\n\n');

  return base ? `${base}\n\n${block}` : block;
}

function upsertTranscriptSummaryContextCard(
  contextCards: Agent['contextCards'],
  summary: string | null,
): Agent['contextCards'] {
  const nextCards = contextCards.filter((card) => card.id !== TRANSCRIPT_SUMMARY_CARD_ID);
  const trimmedSummary = summary?.trim() ?? '';

  if (!trimmedSummary) {
    return nextCards;
  }

  return [
    {
      body: trimmedSummary,
      eyebrow: 'Rolling summary',
      id: TRANSCRIPT_SUMMARY_CARD_ID,
      title: 'Archived Conversation',
    },
    ...nextCards,
  ];
}

function createIsolatedResearchGroupJid(agentId: string, slotNumber: number) {
  return `${toAgentChatJid(agentId)}:isolated-research:${slotNumber}`;
}

function createIsolatedResearchGroupOptions(
  agentName: string,
  slotNumber: number,
  mounts: Array<{ containerPath: string; hostPath: string; readonly?: boolean }>,
): RegisterGroupOptions {
  const name = `${agentName} Research ${slotNumber}`;
  const containerConfig = mounts.length > 0
    ? {
        additionalMounts: mounts.map((mount) => ({
          containerPath: mount.containerPath,
          hostPath: mount.hostPath,
          readonly: mount.readonly ?? false,
        })),
      }
    : null;

  return {
    ...(containerConfig ? { containerConfig } : {}),
    folder: `${ISOLATED_RESEARCH_GROUP_FOLDER_PREFIX}${slotNumber}`,
    isMain: false,
    name,
    requiresTrigger: false,
    trigger: `@${name}`,
  };
}

function buildIsolatedResearchPrompt(
  target: RunIsolatedResearchInput['targets'][number],
  sharedPrompt: string,
) {
  const lines = [
    'You are running one isolated research pass for a single target.',
    'This run does not share transcript history with other targets.',
    'Return a concise, self-contained markdown report that another reducer can merge later.',
    '',
    'Shared instructions:',
    sharedPrompt.trim(),
    '',
    `Target title: ${target.title.trim()}`,
    'Target brief:',
    target.brief.trim(),
  ];

  return lines.join('\n');
}

function buildReducerPrompt(
  reducerPrompt: string,
  results: RunIsolatedResearchResult['results'],
) {
  const serializedResults = results.map((result, index) => [
    `## Result ${index + 1}: ${result.title}`,
    result.targetId ? `Target ID: ${result.targetId}` : 'Target ID: none',
    '',
    result.result.trim(),
  ].join('\n'));

  return [
    'You are merging isolated research results.',
    'Use only the per-target outputs below. Do not assume any other transcript history.',
    '',
    'Reducer instructions:',
    reducerPrompt.trim(),
    '',
    'Per-target results:',
    ...serializedResults,
  ].join('\n');
}

interface AgentSessionTokenTotals {
  inputTokens: number;
  outputTokens: number;
}

type AgentTokenUsageSnapshot = AgentMessageUsage;

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function captureAgentTokenUsageSnapshot(
  message: unknown,
  totals: AgentSessionTokenTotals,
): AgentTokenUsageSnapshot | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const resultMessage = message as Record<string, unknown>;

  if (resultMessage.subtype !== 'success') {
    return null;
  }

  const usage = resultMessage.usage;

  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = asNonNegativeInteger(usageRecord.input_tokens);
  const outputTokens = asNonNegativeInteger(usageRecord.output_tokens);

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  const costUsd = asFiniteNumber(resultMessage.total_cost_usd);

  return {
    ...(costUsd === null ? {} : { costUsd }),
    inputTokens,
    outputTokens,
    sessionInputTotal: totals.inputTokens + inputTokens,
    sessionOutputTotal: totals.outputTokens + outputTokens,
  };
}

function formatTokenCount(count: number) {
  return count.toLocaleString('en-US');
}

function formatTokenCost(costUsd: number) {
  return `$${costUsd.toFixed(costUsd >= 0.01 ? 4 : 6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function formatAgentTokenUsageSummary(usage: AgentTokenUsageSnapshot) {
  const parts = [
    `📊 ${formatTokenCount(usage.inputTokens)} in / ${formatTokenCount(usage.outputTokens)} out tokens`,
  ];

  if (typeof usage.costUsd === 'number' && usage.costUsd > 0) {
    parts.push(`${formatTokenCost(usage.costUsd)} this msg`);
  }

  parts.push(
    `${formatTokenCount(usage.sessionInputTotal)} in / ${formatTokenCount(usage.sessionOutputTotal)} out session total`,
  );

  return parts.join(' • ');
}

function appendAgentTokenUsageSummary(content: string, summary: string) {
  const trimmedContent = content.trimEnd();

  if (!trimmedContent) {
    return summary;
  }

  return `${trimmedContent}\n\n${summary}`;
}

import type {
  AgentRuntimeContract,
  AgentService,
  AgentServiceListener,
  AgentServiceSnapshot,
} from '@/shared/agents/agent-runtime';

export { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';
export type {
  AgentRuntimeContract,
  AgentService,
  AgentServiceListener,
  AgentServiceSnapshot,
};

/** Agent store contract. */
export interface AgentStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

/** Telegram module shape. */
type TelegramModule = typeof import('@boxlite-ai/agentlite/channels/telegram');

// eslint-disable-next-line no-new-func
const importTelegramModule = globalThis.Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<TelegramModule>;

export type { TelegramSecretsStore };

/** Agent runtime options. */
export interface AgentRuntimeOptions {
  actionServices?: ActionHostServices;
  agentStore: AgentStore;
  bundledAgentDir?: string;
  createTelegramChannelFactory?: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;
  detectCodingEngines?: () => Promise<CodingEngineStatus[]>;
  homeDir?: string;
  loadAgentLiteModule?: () => Promise<typeof import('@boxlite-ai/agentlite')>;
  now?: () => number;
  onAgentIdle?: (agentId: string) => void;
  onBudgetExceeded?: (payload: unknown) => void;
  onBudgetWarning?: (payload: unknown) => void;
  onItemActivityChanged?: (payload: { itemId: string; isWorking: boolean }) => void;
  resolveProjectName?: (projectId: string) => Promise<string | null>;
  resolveProjectRootPath?: (projectId: string) => Promise<string | null>;
  resolveModelCredentials?: () => Promise<Record<string, string>>;
  resolveTelegramBotUsername?: (token: string) => Promise<string | null>;
  telegramSecretsStore?: TelegramSecretsStore;
}

import {
  composeAgentSystemPrompt,
  resolveBundledAgentDir,
  seedArtifacts,
} from '../artifacts';

/**
 * Builds ACP peer config using AgentLite's built-in auto-discovery.
 * `auto()` scans $PATH for known agents (claude, codex) and returns
 * configs with full permissions (sandbox disabled, approvals bypassed).
 * Credential env vars are merged into each peer's env.
 */
function createCodingEngineAcpConfig(
  env: Record<string, string>,
): DuneAcpOptions | undefined {
  const peers = autoAcpPeers();
  if (peers.length === 0) return undefined;

  // Merge credential env into each discovered peer.
  if (Object.keys(env).length > 0) {
    for (const peer of peers) {
      peer.env = { ...env, ...peer.env };
    }
  }

  return { peers };
}

/** Implements agent runtime behavior. */
export class AgentRuntime implements AgentRuntimeContract {
  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly messageStream = new MessageStream();

  private readonly pendingTokenUsage = new Map<string, AgentMessageUsage>();

  private readonly pendingTokenUsageSummaries = new Map<string, string>();

  private readonly sessionTokenTotals = new Map<string, AgentSessionTokenTotals>();

  /** Per-agent set of currently running agentlite scheduled task IDs. */
  private readonly runningTaskIds = new Map<string, Set<string>>();

  private readonly records = new AgentRecords();

  private readonly lifecycle = new Lifecycle();

  private readonly agentStore: AgentStore;

  private readonly homeDir: string;

  private readonly onAgentIdle: AgentRuntimeOptions['onAgentIdle'];

  private readonly onBudgetExceeded: AgentRuntimeOptions['onBudgetExceeded'];

  private readonly onBudgetWarning: AgentRuntimeOptions['onBudgetWarning'];

  private readonly onItemActivityChanged: AgentRuntimeOptions['onItemActivityChanged'];

  /** Per-item ephemeral run state driven by AgentLite task.run.* events. */
  private readonly itemActivity = new Map<string, { isWorking: boolean; startedAt: number | null }>();

  private readonly runtimeRoot: string;

  private readonly duneSkillDir: string;

  private readonly projectKickoffSkillDir: string;

  private readonly bundledAgentDir: string;

  private readonly loadAgentLiteModule: () => Promise<typeof import('@boxlite-ai/agentlite')>;

  private readonly resolveProjectName: ((projectId: string) => Promise<string | null>) | null;

  private readonly resolveProjectRootPath: ((projectId: string) => Promise<string | null>) | null;

  private readonly resolveModelCredentials: () => Promise<Record<string, string>>;

  private readonly detectCodingEngines: () => Promise<CodingEngineStatus[]>;

  private readonly telegram: TelegramBridge;

  private readonly actionServices: ActionHostServices | undefined;

  private readonly createTelegramChannelFactory: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;

  private startupModelCredentials: Record<string, string> = {};

  private snapshot: AgentServiceSnapshot;

  private shutdownPromise: Promise<void> | null = null;

  readonly service: AgentService;

  constructor(options: AgentRuntimeOptions) {
    this.agentStore = options.agentStore;
    this.actionServices = options.actionServices;
    this.homeDir = options.homeDir ?? os.homedir();
    this.onAgentIdle = options.onAgentIdle;
    this.onBudgetExceeded = options.onBudgetExceeded;
    this.onBudgetWarning = options.onBudgetWarning;
    this.onItemActivityChanged = options.onItemActivityChanged;
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.bundledAgentDir = options.bundledAgentDir ?? resolveBundledAgentDir();
    const stagingDir = seedAgentSupportSources(this.bundledAgentDir, this.homeDir);
    this.duneSkillDir = path.join(stagingDir, 'skills', 'dune');
    this.projectKickoffSkillDir = path.join(stagingDir, 'skills', 'dune-project-kickoff');
    this.now = options.now ?? Date.now;
    this.loadAgentLiteModule =
      options.loadAgentLiteModule ??
      (() => import('@boxlite-ai/agentlite'));
    this.resolveProjectName = options.resolveProjectName ?? null;
    this.resolveProjectRootPath = options.resolveProjectRootPath ?? null;
    this.resolveModelCredentials =
      options.resolveModelCredentials ??
      (() => Promise.resolve({} satisfies Record<string, string>));
    this.detectCodingEngines = options.detectCodingEngines ?? detectCodingEngines;
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
        onInboundMessage: (agentId, chatJid, content, senderName, attachments) =>
          this.handleObserverInboundMessage(agentId, chatJid, content, senderName, attachments),
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
        await this.telegram.cancelSetupSession(sessionId);
      },
      createAgent: async (input) => this.createAgent(input),
      deleteAgent: async (agentId) => this.deleteAgent(agentId),
      ensureProjectMainAgent: async (projectId, projectName, projectRootPath) =>
        this.ensureProjectMainAgent(projectId, projectName, projectRootPath),
      getTranscriptPage: async (agentId, options) =>
        this.getTranscriptPage(agentId, options),
      getTelegramSetupSession: async (sessionId) =>
        this.telegram.getSetupSession(sessionId),
      getSnapshot: () => this.getSnapshot(),
      listAgents: () => this.getSnapshot().agents,
      callAction: async (name, input) => this.callAgentLiteAction(name, input),
      selectAgent: (agentId) => {
        this.selectAgent(agentId);
      },
      runIsolatedResearch: async (agentId, input) =>
        this.runIsolatedResearch(agentId, input),
      sendMessage: async (agentId, text) => this.sendMessage(agentId, text),
      scheduleItemAssignment: async (agentId, itemId) =>
        this.scheduleItemAssignment(agentId, itemId),
      cancelItemAssignment: async (agentId, taskId) =>
        this.cancelItemAssignment(agentId, taskId),
      isItemTaskKnown: (agentId, taskId) => this.isItemTaskKnown(agentId, taskId),
      startTelegramSetupSession: async (input) =>
        this.telegram.startSetupSession(input),
      subscribe: (listener) => this.subscribe(listener),
      updateAgentChannel: async (input) => {
        await this.updateAgentChannel(input);
      },
      updateAgentDefinition: async (agentId, definition) => {
        await this.updateAgentDefinition(agentId, definition);
      },
      postSystemMessage: async (agentId, body) => {
        await this.postSystemMessage(agentId, body);
      },
    };
  }

  /** Returns snapshot. */
  getSnapshot() {
    return cloneSnapshot(this.snapshot);
  }

  /** Subscribes to agent updates. */
  subscribe(listener: AgentServiceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts agent. */
  async start() {
    seedArtifacts(this.homeDir, this.bundledAgentDir);
    await this.loadPersistedState();

    const credentials = await this.resolveModelCredentials();
    this.startupModelCredentials = { ...credentials };
    await this.ensureAgentLiteReady();

    // Detect coding engines before starting agent runtimes so each agent gets
    // the right ACP peer list for Claude Code / Codex delegation.
    const codingEngines = await this.detectCodingEngines();
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

  /** Shuts down agent. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = Promise.race([
      (async () => {
        this.messageStream.clear();
        this.pendingTokenUsage.clear();
        this.pendingTokenUsageSummaries.clear();
        this.sessionTokenTotals.clear();
        this.runningTaskIds.clear();
        this.telegram.clearAllSetupSessions();

        try {
          await this.telegram.disconnectAll();
        } finally {
          // Detach external channels from all DuneAgent runtimes before
          // stopping the engine so their socket drivers are cleanly closed
          // while the Rust runtime is still alive.
          const runtimes = [...this.lifecycle.allRuntimes()];
          await Promise.allSettled(
            runtimes.map(([, agent]) => agent.detachExternalChannel()),
          );
          await this.lifecycle.stop();
        }
      })(),
      new Promise<void>(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);

    return this.shutdownPromise;
  }

  /** Reloads external channels. */
  async reloadExternalChannels() {
    await this.telegram.refreshRuntimeState({ forceReconnect: true });
  }

  /** Resets agent. */
  reset() {
    this.messageStream.clear();
    this.pendingTokenUsage.clear();
    this.pendingTokenUsageSummaries.clear();
    this.sessionTokenTotals.clear();
    this.runningTaskIds.clear();
    this.telegram.reset();
    this.records.clear();
    this.lifecycle.clearRuntimes();
    this.snapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, this.homeDir, {
        message: 'AgentLite runtime state was cleared in-process.',
        status: this.lifecycle.isEngineReady() ? 'ready' : 'starting',
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
    const definition = normalizeAgentDefinition(
      input.definition,
      input.definition?.archetype ?? 'custom',
    );
    const nextAgent = createDraftAgent(
      agentId,
      trimmedName,
      now,
      input.channelId,
      telegramState,
      externalTarget,
      projectId,
      definition,
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

  private async updateAgentDefinition(
    agentId: string,
    definition: AgentDefinition,
  ) {
    const trimmedId = agentId.trim();
    const record = this.records.get(trimmedId);

    if (!record) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }

    const now = this.now();
    const nextDefinition = cloneAgentDefinition(definition);
    record.agent = {
      ...record.agent,
      definition: nextDefinition,
      updatedAt: now,
    };

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === trimmedId
          ? { ...agent, definition: cloneAgentDefinition(nextDefinition), updatedAt: now }
          : agent,
      ),
    };
    this.persistState();
    this.emit();

    // If the agent is live, rebuild its AgentLite instance so the updated
    // system prompt is picked up on the next turn.
    const existing = this.lifecycle.getRuntime(trimmedId);
    if (existing) {
      this.lifecycle.deleteRuntime(trimmedId);
      try {
        await this.ensureAgentRuntime(record);
      } catch (error) {
        console.error(`Failed to restart agent runtime after definition update.`, error);
      }
    }
  }

  private async postSystemMessage(agentId: string, body: string) {
    const trimmedId = agentId.trim();
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    const record = this.records.get(trimmedId);

    if (!record) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }

    const now = this.now();
    const systemMessage: AgentMessage = {
      attachments: [],
      content: trimmedBody,
      createdAt: now,
      format: 'markdown',
      id: `message-system-${now}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'system',
      status: 'complete',
    };

    record.agent = {
      ...record.agent,
      messages: [...record.agent.messages, systemMessage],
      updatedAt: now,
    };
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === trimmedId
          ? { ...agent, messages: [...agent.messages, systemMessage], updatedAt: now }
          : agent,
      ),
    };
    const didCompactTranscript = this.compactTranscriptForAgent(trimmedId);
    this.persistState();
    this.emit();
    if (didCompactTranscript) {
      void this.rotateCompactedAgentRuntime(trimmedId);
    }

    const duneAgent = this.lifecycle.getRuntime(trimmedId)
      ?? await this.ensureAgentRuntime(record);

    await duneAgent.pushUserMessage(
      toAgentChatJid(trimmedId),
      trimmedBody,
      'system',
    );
  }

  private async ensureProjectMainAgent(
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) {
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
      agent.projectId === trimmedProjectId && agent.definition.archetype === 'project-main',
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
      createDefaultAgentDefinition('project-main'),
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
    this.pendingTokenUsage.delete(agentId);
    this.pendingTokenUsageSummaries.delete(agentId);
    this.sessionTokenTotals.delete(agentId);
    this.runningTaskIds.delete(agentId);
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

  private buildAgentInstructions(record: PersistedAgentRecord) {
    return appendArchivedTranscriptSummary(
      composeAgentSystemPrompt(record.agent.definition, this.homeDir),
      record.transcriptArchive?.rollingSummary ?? null,
    );
  }

  private getCombinedTranscriptMessages(agentId: string): AgentMessage[] {
    const record = this.records.get(agentId);
    const liveAgent = this.snapshot.agents.find((candidate) => candidate.id === agentId) ?? null;
    const archivedMessages = record?.transcriptArchive?.messages ?? [];
    const liveMessages = liveAgent?.messages ?? record?.agent.messages ?? [];

    return [
      ...cloneAgentMessages(archivedMessages),
      ...cloneAgentMessages(liveMessages),
    ];
  }

  private async getTranscriptPage(
    agentId: string,
    options?: { beforeMessageId?: string | null; limit?: number },
  ): Promise<AgentTranscriptPage> {
    const trimmedAgentId = agentId.trim();
    const record = this.records.get(trimmedAgentId);

    if (!record) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }

    const allMessages = this.getCombinedTranscriptMessages(trimmedAgentId);
    const limit = clampTranscriptPageLimit(options?.limit);
    const beforeMessageId = options?.beforeMessageId?.trim() ?? '';
    const anchorIndex = beforeMessageId
      ? allMessages.findIndex((message) => message.id === beforeMessageId)
      : -1;
    const endExclusive = anchorIndex >= 0 ? anchorIndex : allMessages.length;
    const start = Math.max(0, endExclusive - limit);

    return {
      agentId: trimmedAgentId,
      hasOlderMessages: start > 0,
      messages: allMessages.slice(start, endExclusive),
      totalMessageCount: allMessages.length,
    };
  }

  private async ensureIsolatedResearchGroups(
    record: PersistedAgentRecord,
    duneAgent: DuneAgent,
    slotCount: number,
  ) {
    const { didUpdateRecord, mounts } = await this.resolveAgentMounts(record);
    const agentLiteAgent = duneAgent.agentLiteAgent;

    if (didUpdateRecord) {
      this.persistState();
    }

    for (let slotNumber = 1; slotNumber <= slotCount; slotNumber += 1) {
      const jid = createIsolatedResearchGroupJid(record.agent.id, slotNumber);

      if (agentLiteAgent.getGroup(jid)) {
        continue;
      }

      await agentLiteAgent.registerGroup(
        jid,
        createIsolatedResearchGroupOptions(record.agent.name, slotNumber, mounts),
      );
    }
  }

  private async runScheduledTaskAndWaitForResult(
    agentLiteAgent: AgentLiteAgent,
    options: {
      contextMode: 'group' | 'isolated';
      jid: string;
      prompt: string;
      timeoutMs?: number;
    },
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? RESEARCH_RUN_TIMEOUT_MS;

    return new Promise<string>((resolve, reject) => {
      let taskId: string | null = null;
      let settled = false;
      let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

      const finalizeResolve = (result: string | null | undefined) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(result?.trim() || 'No result returned.');
      };

      const finalizeReject = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        if (timeoutHandle) {
          globalThis.clearTimeout(timeoutHandle);
        }

        agentLiteAgent.off('task.run.succeeded', handleSucceeded);
        agentLiteAgent.off('task.run.failed', handleFailed);
        agentLiteAgent.off('task.run.skipped', handleSkipped);
      };

      const handleSucceeded = (event: {
        result: string | null;
        taskId: string;
      }) => {
        if (event.taskId !== taskId) {
          return;
        }

        finalizeResolve(event.result);
      };

      const handleFailed = (event: {
        error: string;
        taskId: string;
      }) => {
        if (event.taskId !== taskId) {
          return;
        }

        finalizeReject(new Error(event.error || 'The research task failed.'));
      };

      const handleSkipped = (event: {
        detail?: string;
        reason: string;
        taskId: string;
      }) => {
        if (event.taskId !== taskId) {
          return;
        }

        finalizeReject(new Error(
          event.detail
            ? `The research task was skipped: ${event.reason} (${event.detail}).`
            : `The research task was skipped: ${event.reason}.`,
        ));
      };

      agentLiteAgent.on('task.run.succeeded', handleSucceeded);
      agentLiteAgent.on('task.run.failed', handleFailed);
      agentLiteAgent.on('task.run.skipped', handleSkipped);

      timeoutHandle = globalThis.setTimeout(() => {
        finalizeReject(new Error(`The research task timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      void (async () => {
        try {
          const task = await agentLiteAgent.scheduleTask({
            contextMode: options.contextMode,
            jid: options.jid,
            prompt: options.prompt,
            scheduleType: 'once',
            scheduleValue: new Date().toISOString(),
          });
          taskId = task.id;

          const taskDetails = agentLiteAgent.getTask(task.id);
          const mostRecentRun = taskDetails?.runs[0] ?? null;

          if (mostRecentRun?.status === 'error') {
            finalizeReject(new Error(mostRecentRun.error || 'The research task failed.'));
            return;
          }

          if (taskDetails?.status === 'completed' || mostRecentRun?.status === 'success') {
            finalizeResolve(taskDetails?.lastResult ?? mostRecentRun?.result ?? null);
          }
        } catch (error) {
          finalizeReject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  private async runIsolatedResearch(
    agentId: string,
    input: RunIsolatedResearchInput,
  ): Promise<RunIsolatedResearchResult> {
    const trimmedAgentId = agentId.trim();
    const record = this.records.get(trimmedAgentId);

    if (!record) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }

    const sharedPrompt = input.sharedPrompt.trim();
    const reducerPrompt = input.reducerPrompt.trim();
    const trimmedTargets = input.targets
      .map((target) => ({
        brief: target.brief.trim(),
        id: target.id?.trim() ?? null,
        title: target.title.trim(),
      }))
      .filter((target) => target.brief.length > 0 && target.title.length > 0);

    if (!sharedPrompt) {
      throw new Error('A shared research prompt is required.');
    }

    if (!reducerPrompt) {
      throw new Error('A reducer prompt is required.');
    }

    if (trimmedTargets.length === 0) {
      throw new Error('At least one research target is required.');
    }

    if (trimmedTargets.length > MAX_RESEARCH_TARGETS) {
      throw new Error(`Research runs are limited to ${MAX_RESEARCH_TARGETS} targets at a time.`);
    }

    const duneAgent = this.lifecycle.getRuntime(trimmedAgentId)
      ?? await this.ensureAgentRuntime(record);
    const maxConcurrency = Math.min(
      clampResearchConcurrency(input.maxConcurrency),
      trimmedTargets.length,
    );

    await this.ensureIsolatedResearchGroups(record, duneAgent, maxConcurrency);

    const agentLiteAgent = duneAgent.agentLiteAgent;
    const slotNumbers = Array.from({ length: maxConcurrency }, (_, index) => index + 1);
    const results = new Array<RunIsolatedResearchResult['results'][number]>(trimmedTargets.length);
    let nextTargetIndex = 0;

    const runTargetOnSlot = async (slotNumber: number) => {
      while (nextTargetIndex < trimmedTargets.length) {
        const currentIndex = nextTargetIndex;
        nextTargetIndex += 1;
        const target = trimmedTargets[currentIndex]!;
        const jid = createIsolatedResearchGroupJid(trimmedAgentId, slotNumber);

        try {
          const result = await this.runScheduledTaskAndWaitForResult(agentLiteAgent, {
            contextMode: 'isolated',
            jid,
            prompt: buildIsolatedResearchPrompt(target, sharedPrompt),
          });

          results[currentIndex] = {
            result,
            targetId: target.id,
            title: target.title,
          };
        } catch (error) {
          results[currentIndex] = {
            result: `Research failed for "${target.title}": ${String(error)}`,
            targetId: target.id,
            title: target.title,
          };
        }
      }
    };

    await Promise.all(slotNumbers.map((slotNumber) => runTargetOnSlot(slotNumber)));

    const mergedResult = await this.runScheduledTaskAndWaitForResult(agentLiteAgent, {
      contextMode: 'isolated',
      jid: createIsolatedResearchGroupJid(trimmedAgentId, slotNumbers[0] ?? 1),
      prompt: buildReducerPrompt(reducerPrompt, results),
    });

    return {
      mergedResult,
      results,
    };
  }

  private compactTranscriptForAgent(agentId: string) {
    const record = this.records.get(agentId);
    const snapshotAgent = this.snapshot.agents.find((candidate) => candidate.id === agentId) ?? null;

    if (!record || !snapshotAgent) {
      return false;
    }

    if (
      snapshotAgent.messages.length <= MAX_LIVE_TRANSCRIPT_MESSAGES
      || snapshotAgent.messages.some((message) => message.status === 'streaming')
    ) {
      return false;
    }

    const overflowMessages = snapshotAgent.messages.slice(0, -MAX_LIVE_TRANSCRIPT_MESSAGES);
    const liveMessages = snapshotAgent.messages.slice(-MAX_LIVE_TRANSCRIPT_MESSAGES);
    const existingArchive = createPersistedTranscriptArchive(record.transcriptArchive ?? {});
    const archivedMessages = [
      ...cloneAgentMessages(existingArchive.messages),
      ...cloneAgentMessages(overflowMessages),
    ];
    const rollingSummary = buildRollingTranscriptSummary(archivedMessages);
    const transcriptArchive = {
      lastCompactedAt: this.now(),
      messages: archivedMessages,
      rollingSummary,
    } satisfies PersistedTranscriptArchive;
    const transcript = createAgentTranscriptSummary({
      archivedMessageCount: archivedMessages.length,
      hasOlderMessages: archivedMessages.length > 0,
      rollingSummary,
      totalMessageCount: archivedMessages.length + liveMessages.length,
    });
    const contextCards = upsertTranscriptSummaryContextCard(
      snapshotAgent.contextCards,
      rollingSummary,
    );

    record.transcriptArchive = transcriptArchive;
    record.agent = {
      ...record.agent,
      contextCards: contextCards.map((card) => ({ ...card })),
      messages: cloneAgentMessages(liveMessages),
      transcript,
    };
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              contextCards,
              messages: liveMessages,
              transcript,
            }
          : agent,
      ),
    };

    return true;
  }

  private async rotateCompactedAgentRuntime(agentId: string) {
    const record = this.records.get(agentId);

    if (
      !record
      || record.agent.definition.archetype === 'project-main'
      || this.messageStream.has(agentId)
      || !this.lifecycle.hasRuntime(agentId)
    ) {
      return;
    }

    this.lifecycle.deleteRuntime(agentId);

    try {
      await this.lifecycle.deleteSdkAgent(record.groupFolder);
      await this.ensureAgentRuntime(record);
    } catch (error) {
      console.error(`Failed to rotate compacted runtime session for "${record.agent.name}".`, error);
    }
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private async sendMessage(agentId: string, text: string) {
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

  private async scheduleItemAssignment(agentId: string, itemId: string): Promise<string | null> {
    const record = this.records.get(agentId);

    if (!record) {
      return null;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;

    if (!agent?.channel.canCompose) {
      return null;
    }

    const duneAgent = this.lifecycle.getRuntime(agentId)
      ?? await this.ensureAgentRuntime(record);

    const task = await duneAgent.agentLiteAgent.scheduleTask({
      jid: toAgentChatJid(agentId),
      prompt: `You have been assigned work item id: ${itemId}`,
      scheduleType: 'once',
      scheduleValue: new Date().toISOString(),
    });

    return task.id;
  }

  private async cancelItemAssignment(agentId: string, taskId: string): Promise<void> {
    const duneAgent = this.lifecycle.getRuntime(agentId);

    if (!duneAgent) {
      return;
    }

    try {
      await duneAgent.agentLiteAgent.cancelTask(taskId);
    } catch {
      // Task may have already completed or been removed; ignore.
    }
  }

  /** Returns true when the task still exists and remains active in agentlite. */
  private isItemTaskKnown(agentId: string, taskId: string): boolean {
    const duneAgent = this.lifecycle.getRuntime(agentId);

    if (!duneAgent) {
      return false;
    }

    try {
      return duneAgent.agentLiteAgent.getTask(taskId)?.status === 'active';
    } catch {
      return false;
    }
  }

  private async recordItemTaskStartedActivity(
    snapshot: WorkflowSnapshot,
    item: WorkflowItem,
    startedAt: number,
    actor?: string,
  ): Promise<void> {
    const actionServices = this.actionServices;

    if (!actionServices) {
      return;
    }

    recordWorkflowItemEvents(
      snapshot,
      item,
      [createWorkflowEvent('item', 'Started working on this item.', startedAt, actor)],
      startedAt,
    );
    await writeWorkflowSnapshot(actionServices.workflowStore, snapshot, actionServices.onWorkflowChanged);
  }

  private async updateItemActivityForTask(
    taskId: string,
    isWorking: boolean,
    actor?: string,
  ): Promise<void> {
    const workflowStore = this.actionServices?.workflowStore;

    if (!workflowStore) {
      return;
    }

    const snapshot = await readWorkflowSnapshot(workflowStore);
    const item = snapshot.items.find((candidate) => candidate.scheduledTaskId === taskId) ?? null;

    if (!item) {
      return;
    }

    const current = this.itemActivity.get(item.id);

    if (current?.isWorking === isWorking) {
      return;
    }

    const startedAt = isWorking ? this.now() : null;

    this.itemActivity.set(item.id, {
      isWorking,
      startedAt,
    });
    this.onItemActivityChanged?.({ itemId: item.id, isWorking });

    if (isWorking && startedAt !== null) {
      await this.recordItemTaskStartedActivity(snapshot, item, startedAt, actor);
    }
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
    this.pendingTokenUsage.delete(agentId);
    this.pendingTokenUsageSummaries.delete(agentId);
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

  private handleExternalInboundMessage(agentId: string, text: string, senderName: string, attachmentSources: string[] = []) {
    const now = this.now();
    const { content: strippedContent } = extractWorkspaceAttachmentPaths(text);
    const agent = this.snapshot.agents.find((a) => a.id === agentId);
    const chatTargetName = agent?.channel?.target?.name ?? '';
    const transcriptText =
      senderName !== 'External' && senderName !== chatTargetName
        ? `${senderName}: ${strippedContent}`
        : strippedContent;
    const record = this.records.get(agentId);
    const attachments = record
      ? normalizeAgentAttachments(attachmentSources, { groupFolder: record.groupFolder, runtimeRoot: this.runtimeRoot })
      : [];
    const userMessage = {
      ...createUserMessage(transcriptText, now),
      attachments,
      format: 'plain' as const,
    };

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              messages: [...a.messages, userMessage],
              preview: summarizePreview(transcriptText),
              updatedAt: now,
            }
          : a,
      ),
    };
    const didCompactTranscript = this.compactTranscriptForAgent(agentId);
    this.persistState();
    this.emit();
    if (didCompactTranscript) {
      void this.rotateCompactedAgentRuntime(agentId);
    }
  }

  private async handleObserverInboundMessage(
    agentId: string,
    _chatJid: string,
    content: string,
    senderName: string,
    attachments: string[],
  ) {
    if (this.messageStream.has(agentId)) {
      return;
    }

    const { content: strippedContent } = extractWorkspaceAttachmentPaths(content);
    const agent = this.snapshot.agents.find((a) => a.id === agentId);
    const chatTargetName = agent?.channel?.target?.name ?? '';
    const transcriptText =
      senderName && senderName !== 'External' && senderName !== chatTargetName
        ? `${senderName}: ${strippedContent}`
        : strippedContent;

    await this.dispatchAgentInput(agentId, {
      attachmentSources: attachments,
      format: 'plain',
      rawText: strippedContent,
      senderName,
      selectAgent: false,
      timestamp: this.now(),
      transcriptText,
    });
  }

  private captureTokenUsageSummary(agentId: string, message: unknown) {
    const currentTotals = this.sessionTokenTotals.get(agentId) ?? {
      inputTokens: 0,
      outputTokens: 0,
    };
    const usage = captureAgentTokenUsageSnapshot(message, currentTotals);

    if (!usage) {
      return;
    }

    this.sessionTokenTotals.set(agentId, {
      inputTokens: usage.sessionInputTotal,
      outputTokens: usage.sessionOutputTotal,
    });
    this.pendingTokenUsage.set(agentId, usage);
    this.pendingTokenUsageSummaries.set(agentId, formatAgentTokenUsageSummary(usage));
  }

  private decorateOutboundMessage(chatJid: string, text: string) {
    const agentId = this.resolveAgentIdByChatJid(chatJid);

    if (!agentId) {
      return text;
    }

    const summary = this.pendingTokenUsageSummaries.get(agentId);

    if (!summary) {
      return text;
    }

    this.pendingTokenUsageSummaries.delete(agentId);
    return appendAgentTokenUsageSummary(text, summary);
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

  /** Tracks running scheduled tasks per agent and updates agent.status accordingly. */
  private markTaskRunning(agentId: string, taskId: string, running: boolean) {
    const set = this.runningTaskIds.get(agentId) ?? new Set<string>();

    if (running) {
      set.add(taskId);
    } else {
      set.delete(taskId);
    }

    if (set.size > 0) {
      this.runningTaskIds.set(agentId, set);
    } else {
      this.runningTaskIds.delete(agentId);
    }

    const streaming = this.messageStream.has(agentId);
    const isRunning = set.size > 0 || streaming;
    const nextStatus: AgentStatus = isRunning ? 'live' : 'ready';

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.id === agentId && agent.status !== 'draft' && agent.status !== nextStatus
          ? { ...agent, status: nextStatus, updatedAt: this.now() }
          : agent,
      ),
    };
    this.emit();
  }

  private pushActivityEvent(agentId: string, event: AgentActivityEvent) {
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) => {
        if (agent.id !== agentId) {
          return agent;
        }

        const events = [...agent.activityEvents, event];

        return {
          ...agent,
          activityEvents: events.length > MAX_ACTIVITY_EVENTS
            ? events.slice(-MAX_ACTIVITY_EVENTS)
            : events,
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
    const usage = this.pendingTokenUsage.get(agentId);

    this.messageStream.forget(agentId);
    this.pendingTokenUsage.delete(agentId);

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
                      ...(usage ? { usage: { ...usage } } : {}),
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
    const didCompactTranscript = this.compactTranscriptForAgent(agentId);
    this.persistState();
    this.emit();
    if (didCompactTranscript) {
      void this.rotateCompactedAgentRuntime(agentId);
    }
    this.onAgentIdle?.(agentId);

    const agent = this.snapshot.agents.find((item) => item.id === agentId) ?? null;
    const completedMessage = agent?.messages.find((message) => message.id === pending.messageId);

    // Outbound Telegram delivery is handled by DuneChannel's external driver.
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

  private async resolveAgentMounts(record: PersistedAgentRecord): Promise<{
    didUpdateRecord: boolean;
    mounts: Array<{ containerPath: string; hostPath: string; readonly?: boolean }>;
  }> {
    const mounts: Array<{ containerPath: string; hostPath: string; readonly?: boolean }> = [];
    let didUpdateRecord = false;

    if (!record.agent.projectId) {
      return { didUpdateRecord, mounts };
    }

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

      const duneMountLayout = createDuneMountLayout(
        this.homeDir,
        record.agent.projectId,
        projectName,
        projectRootPath,
        record.agent.id,
        record.agent.name,
        record.agent.definition.archetype,
      );
      mounts.push({
        containerPath: 'dune',
        hostPath: duneMountLayout.duneMountRoot,
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
      console.error(`Failed to create dune mount layout for "${record.agent.name}".`, error);
    }

    return { didUpdateRecord, mounts };
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

  private async callAgentLiteAction(
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const groupJid = typeof input.group_jid === 'string' ? input.group_jid : null;
    const agentId = groupJid
      ? toAgentPathId(groupJid)
      : this.snapshot.selectedAgentId ?? this.snapshot.agents[0]?.id ?? null;

    if (!agentId) {
      return null;
    }

    const record = this.records.get(agentId);

    if (!record) {
      return null;
    }

    const duneAgent = await this.ensureAgentRuntime(record);
    const alAgent = duneAgent.agentLiteAgent as AgentLiteAgent & {
      callAction?: (actionName: string, actionInput: Record<string, unknown>) => Promise<unknown>;
    };

    if (typeof alAgent.callAction !== 'function') {
      return null;
    }

    return alAgent.callAction(name, input);
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
      const { didUpdateRecord, mounts } = await this.resolveAgentMounts(record);

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

      const actionServicesForAgent = this.actionServices;
      const ownerProjectId = record.agent.projectId;
      const duneMountHostDir = mounts.find((m) => m.containerPath === 'dune')?.hostPath ?? '';
      const duneMountContainerDir = '/workspace/extra/dune/';
      const acp = createCodingEngineAcpConfig(
        this.startupModelCredentials,
      );

      const duneAgent = new DuneAgent({
        ...(acp ? { acp } : {}),
        agentLite,
        boundExternalJid,
        credentials: () => Promise.resolve({ ...this.startupModelCredentials }),
        decorateOutboundMessage: (chatJid, text) => this.decorateOutboundMessage(chatJid, text),
        externalChannelFactory,
        groupFolder: record.groupFolder,
        instructions: this.buildAgentInstructions(record),
        ...(mounts.length > 0 ? { mounts } : {}),
        name: record.agent.name,
        onExternalInbound: (text, senderName, attachments) => {
          this.handleExternalInboundMessage(agentId, text, senderName, attachments);
        },
        onOutboundMessage: (chatJid, text) => {
          this.handleOutboundMessage(chatJid, text);
        },
        primaryChatJid: toAgentChatJid(agentId),
        ...(actionServicesForAgent && ownerProjectId ? {
          registerActions: (alAgent) => registerDuneActions(alAgent, actionServicesForAgent, {
            agentId,
            agentName: record.agent.name,
            projectId: ownerProjectId,
            duneMountHostDir,
            duneMountContainerDir,
          }),
        } : {}),
        skills: record.agent.definition.archetype === 'project-main'
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

      alAgent.on('budget.exceeded', (event: Record<string, unknown>) => {
        this.onBudgetExceeded?.({
          agentId,
          jid: toAgentChatJid(agentId),
          ...event,
        });
      });

      alAgent.on('budget.warning', (event: Record<string, unknown>) => {
        this.onBudgetWarning?.({
          agentId,
          jid: toAgentChatJid(agentId),
          ...event,
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

        if (sdkType === 'result') {
          this.pendingTokenUsage.delete(agentId);
          this.pendingTokenUsageSummaries.delete(agentId);
          this.captureTokenUsageSummary(agentId, msg);
        }

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

      // Scheduled task lifecycle — drives agent.status for non-chat work and
      // per-item green-light activity for items whose scheduledTaskId matches.
      alAgent.on('task.run.started', (event) => {
        this.markTaskRunning(agentId, event.taskId, true);
        void this.updateItemActivityForTask(event.taskId, true, record.agent.name);
      });
      alAgent.on('task.run.succeeded', (event) => {
        this.markTaskRunning(agentId, event.taskId, false);
        void this.updateItemActivityForTask(event.taskId, false);
      });
      alAgent.on('task.run.failed', (event) => {
        this.markTaskRunning(agentId, event.taskId, false);
        void this.updateItemActivityForTask(event.taskId, false);
      });
      alAgent.on('task.run.skipped', (event) => {
        this.markTaskRunning(agentId, event.taskId, false);
      });

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
    this.pendingTokenUsage.delete(agentId);
    this.pendingTokenUsageSummaries.delete(agentId);
    this.sessionTokenTotals.delete(agentId);
    this.runningTaskIds.delete(agentId);
    this.records.delete(agentId);
    this.lifecycle.deleteRuntime(agentId);

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
      let didCompactPersistedTranscript = false;

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

      for (const agent of snapshotAgents) {
        didCompactPersistedTranscript = this.compactTranscriptForAgent(agent.id) || didCompactPersistedTranscript;
      }

      if (didPruneOrphans) {
        this.persistState();
      } else if (didCompactPersistedTranscript) {
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
          activityEvents: [],
          channel: {
            ...agent.channel,
            target: agent.channel.target ? { ...agent.channel.target } : null,
          },
          codingEngineEvents: agent.codingEngineEvents.map((event) => ({ ...event })),
          contextCards: agent.contextCards.map((card) => ({ ...card })),
          messages: agent.messages.map((message) => ({
            ...message,
            attachments: message.attachments.map((attachment) => ({ ...attachment })),
            ...(message.usage ? { usage: { ...message.usage } } : {}),
          })),
          telegram: cloneTelegramAgentRuntimeState(agent.telegram),
          transcript: { ...agent.transcript },
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
