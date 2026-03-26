import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Agent,
  AgentChannelBinding,
  AgentChannelId,
  AgentMessage,
  AgentRuntimeInfo,
  CreateAgentInput,
} from '../../renderer/features/agents/types';
import { DuneChannel } from './dune-channel';

const HIDDEN_MAIN_GROUP_ID = 'dune:main';
const DUNE_RUNTIME_STATE_FILENAME = 'dune-runtime-state.json';
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const CLAUDE_CODE_OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';
const STREAMING_IDLE_WINDOW_MS = 320;
const STREAMING_SAFETY_TIMEOUT_MS = 30_000;

export interface AgentServiceSnapshot {
  agents: Agent[];
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
}

export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

export interface AgentService {
  createAgent: (input: CreateAgentInput) => Promise<string>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  subscribe: (listener: AgentServiceListener) => () => void;
}

export interface AgentRuntime {
  getSnapshot: () => AgentServiceSnapshot;
  reset: () => void;
  service: AgentService;
  subscribe: (listener: AgentServiceListener) => () => void;
}

export interface AgentLiteChannel {
  _setOpts?: (callbacks: DuneChannelCallbacks) => void;
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  isConnected: () => boolean;
  name: string;
  ownsJid: (jid: string) => boolean;
  sendMessage: (jid: string, text: string) => Promise<void> | void;
}

export interface AgentLiteGroupRegistration {
  folder?: string;
  isMain?: boolean;
  name: string;
  requiresTrigger?: boolean;
  trigger?: string;
}

export interface AgentLiteInstance {
  registerChannel: (channel: AgentLiteChannel) => Promise<void>;
  registerGroup: (jid: string, options: AgentLiteGroupRegistration) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface AgentLiteModule {
  AgentLite: new (options?: AgentLiteInstanceOptions) => AgentLiteInstance;
}

export interface AgentLiteInstanceOptions {
  model?: {
    credentials?: () => Promise<Record<string, string>>;
  };
  name?: string;
  workdir?: string;
}

export interface RegisteredGroup {
  name?: string;
}

export interface NewMessage {
  chat_jid: string;
  content: string;
  id: string;
  is_bot_message?: boolean;
  is_from_me: boolean;
  sender: string;
  sender_name?: string;
  timestamp: string;
}

export interface DuneChannelCallbacks {
  onChatMetadata: (
    chatJid: string,
    timestamp: string,
    name?: string,
    channel?: string,
    isGroup?: boolean,
  ) => void;
  onMessage: (chatJid: string, message: NewMessage) => void;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

interface PersistedAgentRecord {
  agent: AgentServiceSnapshot['agents'][number];
  groupFolder: string;
}

interface PersistedRuntimeState {
  agents: PersistedAgentRecord[];
  selectedAgentId: string | null;
}

interface PendingAssistantMessage {
  idleTimer: ReturnType<typeof globalThis.setTimeout> | null;
  messageId: string;
  safetyTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

export interface AgentLiteHostOptions {
  credentialEnv?: NodeJS.ProcessEnv;
  homeDir?: string;
  loadAgentLiteModule?: () => Promise<AgentLiteModule>;
  now?: () => number;
}

function cloneSnapshot(snapshot: AgentServiceSnapshot): AgentServiceSnapshot {
  return {
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      channel: { ...agent.channel },
      contextCards: agent.contextCards.map((card) => ({ ...card })),
      messages: agent.messages.map((message) => ({ ...message })),
    })),
    isStreaming: snapshot.isStreaming,
    runtimeInfo: { ...snapshot.runtimeInfo },
    selectedAgentId: snapshot.selectedAgentId,
  };
}

function createMessageId(role: AgentMessage['role'], now: number) {
  return `message-${role}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizePreview(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 92);
}

function resolveAgentLiteCredentials(env: NodeJS.ProcessEnv) {
  const claudeOauthToken = env[CLAUDE_CODE_OAUTH_TOKEN_ENV]?.trim();

  if (claudeOauthToken) {
    return {
      [CLAUDE_CODE_OAUTH_TOKEN_ENV]: claudeOauthToken,
    };
  }

  const anthropicApiKey = env[ANTHROPIC_API_KEY_ENV]?.trim();

  if (anthropicApiKey) {
    return {
      [ANTHROPIC_API_KEY_ENV]: anthropicApiKey,
    };
  }

  return {} satisfies Record<string, string>;
}

function createRuntimeReadyMessage(credentials: Record<string, string>) {
  return Object.keys(credentials).length > 0
    ? 'AgentLite is running with explicit Claude credentials.'
    : 'AgentLite is running without model credentials; replies will fail.';
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
  return `dune:agent:${randomUUID()}`;
}

function createGroupFolder(name: string, agentId: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';

  return `${slug}-${agentId.split(':').pop()?.slice(0, 8) ?? 'agent'}`;
}

function createChannelBinding(channelId: AgentChannelId): AgentChannelBinding {
  switch (channelId) {
    case 'discord':
      return {
        canCompose: false,
        id: 'discord',
        kind: 'external',
        label: 'Discord',
        status: 'connected',
      };
    case 'slack':
      return {
        canCompose: false,
        id: 'slack',
        kind: 'external',
        label: 'Slack',
        status: 'connected',
      };
    case 'telegram':
      return {
        canCompose: false,
        id: 'telegram',
        kind: 'external',
        label: 'Telegram',
        status: 'connected',
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
): Agent {
  const channel = createChannelBinding(channelId);
  const isBuiltInChannel = channel.kind === 'built-in';

  return {
    channel,
    contextCards: [
      {
        body: isBuiltInChannel
          ? 'This agent now runs through AgentLite from the Dune runtime root under ~/.dune/agentlite.'
          : `This agent mirrors ${channel.label} through the AgentLite runtime that Dune manages.`,
        eyebrow: 'Runtime',
        id: `context-${now}-1`,
        title: isBuiltInChannel
          ? 'AgentLite is driving this workspace'
          : `${channel.label} is backed by AgentLite`,
      },
      {
        body: 'The main process owns the runtime bridge and forwards live AgentLite snapshot updates back into the renderer.',
        eyebrow: 'Bridge',
        id: `context-${now}-2`,
        title: 'Desktop-managed runtime',
      },
    ],
    id: agentId,
    messages: [] satisfies AgentMessage[],
    name,
    note: isBuiltInChannel
      ? 'This agent is running inside the real AgentLite foundation that Dune now hosts directly in the desktop runtime.'
      : `This agent is bound to ${channel.label} and mirrors its transcript through the Dune host.`,
    preview: isBuiltInChannel
      ? 'Ready for a first instruction.'
      : `Attached to ${channel.label}. Dune mirrors the transcript.`,
    status: 'draft',
    updatedAt: now,
    workspace: 'AgentLite agent',
  };
}

function createUserMessage(content: string, now: number): AgentMessage {
  return {
    content,
    createdAt: now,
    id: createMessageId('user', now),
    role: 'user',
    status: 'complete',
  };
}

function createAssistantMessage(now: number): AgentMessage {
  return {
    content: '',
    createdAt: now,
    id: createMessageId('assistant', now),
    role: 'assistant',
    status: 'streaming',
  };
}

function ensureDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveAgentLiteRuntimeRoot(homeDir: string = os.homedir()) {
  return path.join(homeDir, '.dune', 'agentlite');
}

export class AgentLiteHost implements AgentRuntime {
  private readonly duneChannel: DuneChannel;

  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly pendingAssistantMessages = new Map<string, PendingAssistantMessage>();

  private readonly persistedAgents = new Map<string, PersistedAgentRecord>();

  private readonly credentialEnv: NodeJS.ProcessEnv;

  private readonly runtimeRoot: string;

  private readonly stateFilePath: string;

  private agentLite: AgentLiteInstance | null = null;

  private readonly loadAgentLiteModule: () => Promise<AgentLiteModule>;

  private snapshot: AgentServiceSnapshot;

  readonly service: AgentService;

  constructor(options: AgentLiteHostOptions = {}) {
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.stateFilePath = path.join(
      this.runtimeRoot,
      'data',
      DUNE_RUNTIME_STATE_FILENAME,
    );
    this.credentialEnv = options.credentialEnv ?? process.env;
    this.now = options.now ?? Date.now;
    this.loadAgentLiteModule =
      options.loadAgentLiteModule ??
      (async () => import('@boxlite-ai/agentlite') as Promise<AgentLiteModule>);
    this.snapshot = {
      agents: [],
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot),
      selectedAgentId: null,
    };
    this.duneChannel = new DuneChannel({
      onOutboundMessage: async (jid, text) => {
        this.handleOutboundMessage(jid, text);
      },
    });
    this.service = {
      createAgent: async (input) => this.createAgent(input),
      getSnapshot: () => this.getSnapshot(),
      listAgents: () => this.getSnapshot().agents,
      selectAgent: (agentId) => {
        this.selectAgent(agentId);
      },
      sendMessage: async (agentId, text) => this.sendMessage(agentId, text),
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
    this.loadPersistedState();

    const { AgentLite } = await this.loadAgentLiteModule();
    const credentials = resolveAgentLiteCredentials(this.credentialEnv);
    const agentLite = new AgentLite({
      model: {
        credentials: async () => ({ ...credentials }),
      },
      name: 'Dune',
      workdir: this.runtimeRoot,
    });

    await agentLite.registerChannel(this.duneChannel);
    agentLite.registerGroup(HIDDEN_MAIN_GROUP_ID, {
      folder: 'main',
      isMain: true,
      name: 'Dune Control',
      requiresTrigger: false,
    });

    for (const [agentId, record] of this.persistedAgents) {
      agentLite.registerGroup(agentId, {
        folder: record.groupFolder,
        name: record.agent.name,
        requiresTrigger: false,
      });
    }

    await agentLite.start();
    this.agentLite = agentLite;
    this.snapshot = {
      ...this.snapshot,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
        message: createRuntimeReadyMessage(credentials),
        status: 'ready',
      }),
    };
    this.emit();
  }

  async shutdown() {
    this.clearPendingAssistantMessages();
    await this.agentLite?.stop();
    this.agentLite = null;
  }

  reset() {
    this.clearPendingAssistantMessages();
    this.persistedAgents.clear();
    this.snapshot = {
      agents: [],
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot, {
        message: 'AgentLite runtime state was cleared in-process.',
        status: this.agentLite ? 'ready' : 'starting',
      }),
      selectedAgentId: null,
    };
    this.persistState();
    this.emit();
  }

  private async createAgent(input: CreateAgentInput) {
    const trimmedName = input.name.trim();

    if (!trimmedName) {
      throw new Error('Agent name is required.');
    }

    const now = this.now();
    const agentId = createAgentId();
    const groupFolder = createGroupFolder(trimmedName, agentId);
    const nextAgent = createDraftAgent(agentId, trimmedName, now, input.channelId);

    this.persistedAgents.set(agentId, {
      agent: nextAgent,
      groupFolder,
    });
    this.snapshot = {
      ...this.snapshot,
      agents: [nextAgent, ...this.snapshot.agents],
      selectedAgentId: agentId,
    };
    this.persistState();
    this.emit();

    this.agentLite?.registerGroup(agentId, {
      folder: groupFolder,
      name: trimmedName,
      requiresTrigger: false,
    });

    return agentId;
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

  private async sendMessage(agentId: string, text: string) {
    const trimmedText = text.trim();

    if (!trimmedText || this.snapshot.isStreaming) {
      return;
    }

    const agent = this.snapshot.agents.find((item) => item.id === agentId);

    if (!agent || !agent.channel.canCompose) {
      return;
    }

    const now = this.now();
    const assistantMessage = createAssistantMessage(now);
    const userMessage = createUserMessage(trimmedText, now);

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
              preview: summarizePreview(trimmedText),
              status: 'live',
              updatedAt: now,
            }
          : item,
      ),
      isStreaming: true,
      selectedAgentId: agentId,
    };
    this.persistState();
    this.emit();

    await this.duneChannel.pushInboundMessage(agentId, trimmedText);
  }

  private loadPersistedState() {
    if (!fs.existsSync(this.stateFilePath)) {
      return;
    }

    try {
      const fileContents = fs.readFileSync(this.stateFilePath, 'utf-8');
      const parsedState = JSON.parse(fileContents) as PersistedRuntimeState;
      const agents = parsedState.agents ?? [];

      this.persistedAgents.clear();

      for (const record of agents) {
        this.persistedAgents.set(record.agent.id, record);
      }

      this.snapshot = {
        ...this.snapshot,
        agents: agents.map((record) => record.agent),
        selectedAgentId: parsedState.selectedAgentId,
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
    ensureDirectory(path.dirname(this.stateFilePath));

    const persistedState: PersistedRuntimeState = {
      agents: [...this.persistedAgents.values()],
      selectedAgentId: this.snapshot.selectedAgentId,
    };

    fs.writeFileSync(this.stateFilePath, JSON.stringify(persistedState, null, 2));
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
                content: text,
                createdAt: now,
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
      isStreaming: pending ? this.snapshot.isStreaming : false,
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
        isStreaming: false,
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
      isStreaming: false,
    };
    this.pendingAssistantMessages.delete(agentId);
    this.persistState();
    this.emit();
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
