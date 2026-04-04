import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type { TelegramChannelOpts } from '@boxlite-ai/agentlite/channels/telegram';

import type {
  Agent,
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelStatus,
  AgentExternalTarget,
  AgentMessage,
  AgentRuntimeInfo,
  CreateAgentInput,
  DiscoveredExternalChat,
  ExternalChannelsState,
} from '../../renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  createDefaultExternalChannelsState,
} from '../../renderer/features/agents/model/channels';
import { DuneChannel } from './dune-channel';
import {
  ManagedTelegramChannel,
  type ManagedTelegramChannelHooks,
  type RuntimeTelegramChannel,
} from './managed-telegram-channel';

const HIDDEN_MAIN_GROUP_ID = 'dune:main';
const STREAMING_IDLE_WINDOW_MS = 320;
const STREAMING_SAFETY_TIMEOUT_MS = 30_000;

export interface AgentServiceSnapshot {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
}

export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

export interface AgentService {
  createAgent: (input: CreateAgentInput) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
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
  _setOpts?: ((callbacks: DuneChannelCallbacks) => void) | ((callbacks: TelegramChannelOpts) => void);
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  isConnected: () => boolean;
  name: string;
  ownsJid: (jid: string) => boolean;
  sendMessage: (jid: string, text: string) => Promise<void> | void;
  setTyping?: (jid: string, isTyping: boolean) => Promise<void> | void;
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

export interface AgentStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

interface PendingAssistantMessage {
  idleTimer: ReturnType<typeof globalThis.setTimeout> | null;
  messageId: string;
  safetyTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

export interface AgentLiteHostOptions {
  agentStore: AgentStore;
  createTelegramChannel?: (hooks: ManagedTelegramChannelHooks) => RuntimeTelegramChannel;
  homeDir?: string;
  loadAgentLiteModule?: () => Promise<AgentLiteModule>;
  now?: () => number;
  resolveModelCredentials?: () => Promise<Record<string, string>>;
  resolveTelegramBotToken?: () => Promise<string>;
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
      messages: agent.messages.map((message) => ({ ...message })),
      projectId: agent.projectId ?? null,
    })),
    externalChannels: cloneExternalChannelsState(snapshot.externalChannels),
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

function fingerprintTelegramToken(token: string) {
  if (!token) {
    return null;
  }

  return createHash('sha256').update(token).digest('hex');
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

function mapTelegramChannelStatus(
  externalChannels: ExternalChannelsState,
): AgentChannelStatus {
  switch (externalChannels.telegram.status) {
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
  externalChannels: ExternalChannelsState,
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
        status: mapTelegramChannelStatus(externalChannels),
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
  externalChannels: ExternalChannelsState,
  externalTarget: AgentExternalTarget | null,
  projectId: string | null,
): Agent {
  const channel = createChannelBinding(channelId, externalChannels, externalTarget);
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
    status: 'draft',
    updatedAt: now,
    workspace: 'AgentLite agent',
  };
}

function resolveAgentGroupJid(agent: Agent) {
  return agent.channel.target?.jid ?? agent.id;
}

function createMirroredMessageId(
  role: AgentMessage['role'],
  chatJid: string,
  sourceId: string,
) {
  return `mirror-${role}-${chatJid}-${sourceId}`;
}

function parseMessageTimestamp(timestamp: string, fallback: number) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function resolveAgentLiteRuntimeRoot(homeDir: string = os.homedir()) {
  return path.join(homeDir, '.dune', 'agentlite');
}

export class AgentLiteHost implements AgentRuntime {
  private readonly duneChannel: DuneChannel;

  private readonly listeners = new Set<AgentServiceListener>();

  private readonly now: () => number;

  private readonly pendingAssistantMessages = new Map<string, PendingAssistantMessage>();

  private readonly persistedAgents = new Map<string, PersistedAgentRecord>();

  private readonly agentStore: AgentStore;

  private readonly runtimeRoot: string;

  private agentLite: AgentLiteInstance | null = null;

  private readonly loadAgentLiteModule: () => Promise<AgentLiteModule>;

  private readonly resolveModelCredentials: () => Promise<Record<string, string>>;

  private readonly resolveTelegramBotToken: () => Promise<string>;

  private startupModelCredentials: Record<string, string> = {};

  private snapshot: AgentServiceSnapshot;

  private readonly telegramChannel: RuntimeTelegramChannel;

  private shutdownPromise: Promise<void> | null = null;

  private persistedTelegramTokenFingerprint: string | null = null;

  readonly service: AgentService;

  constructor(options: AgentLiteHostOptions) {
    this.agentStore = options.agentStore;
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(options.homeDir);
    this.now = options.now ?? Date.now;
    this.loadAgentLiteModule =
      options.loadAgentLiteModule ??
      (async () => import('@boxlite-ai/agentlite') as Promise<AgentLiteModule>);
    this.resolveModelCredentials =
      options.resolveModelCredentials ??
      (() => Promise.resolve({} satisfies Record<string, string>));
    this.resolveTelegramBotToken =
      options.resolveTelegramBotToken ??
      (() => Promise.resolve(''));
    this.snapshot = {
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: createRuntimeInfo(this.runtimeRoot),
      selectedAgentId: null,
    };
    this.duneChannel = new DuneChannel({
      onOutboundMessage: (jid, text) => {
        this.handleOutboundMessage(jid, text);
      },
    });
    const createTelegramChannel =
      options.createTelegramChannel ??
      ((hooks: ManagedTelegramChannelHooks) => new ManagedTelegramChannel(hooks));
    this.telegramChannel = createTelegramChannel({
      onChatMetadata: (chatJid, timestamp, name, _channel, isGroup) => {
        this.handleTelegramChatMetadata(chatJid, timestamp, name, isGroup);
      },
      onInboundMessage: (chatJid, message) => {
        this.handleTelegramInboundMessage(chatJid, message);
      },
      onOutboundMessage: (chatJid, text) => {
        this.handleTelegramOutboundMessage(chatJid, text);
      },
    });
    this.service = {
      createAgent: (input) => Promise.resolve(this.createAgent(input)),
      deleteAgent: (agentId) => Promise.resolve(this.deleteAgent(agentId)),
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
    await this.loadPersistedState();

    const { AgentLite } = await this.loadAgentLiteModule();
    const credentials = await this.resolveModelCredentials();
    this.startupModelCredentials = { ...credentials };
    const agentLite = new AgentLite({
      model: {
        credentials: () => Promise.resolve({ ...this.startupModelCredentials }),
      },
      name: 'Dune',
      workdir: this.runtimeRoot,
    });

    await agentLite.registerChannel(this.duneChannel);
    await agentLite.registerChannel(this.telegramChannel);
    agentLite.registerGroup(HIDDEN_MAIN_GROUP_ID, {
      folder: 'main',
      isMain: true,
      name: 'Dune Control',
      requiresTrigger: false,
    });

    for (const record of this.persistedAgents.values()) {
      agentLite.registerGroup(resolveAgentGroupJid(record.agent), {
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
    await this.reloadExternalChannels();
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.clearPendingAssistantMessages();

      try {
        await this.agentLite?.stop();
      } finally {
        this.agentLite = null;
        await this.telegramChannel.reset();
      }
    })();

    return this.shutdownPromise;
  }

  async reloadExternalChannels() {
    const token = (await this.resolveTelegramBotToken()).trim();
    const nextTokenFingerprint = fingerprintTelegramToken(token);
    const tokenChanged = this.persistedTelegramTokenFingerprint !== nextTokenFingerprint;

    this.persistedTelegramTokenFingerprint = nextTokenFingerprint;

    const nextTelegramState = {
      ...this.snapshot.externalChannels.telegram,
      botUsername: null,
      configured: Boolean(token),
      discoveredChats: tokenChanged ? [] : this.snapshot.externalChannels.telegram.discoveredChats,
      errorMessage: null,
      status: token ? 'connecting' : 'not-configured',
    } as ExternalChannelsState['telegram'];

    this.applyTelegramState(nextTelegramState);

    try {
      await this.telegramChannel.reconfigure(token || null);
      this.applyTelegramState({
        ...this.snapshot.externalChannels.telegram,
        botUsername: token ? this.telegramChannel.getBotUsername() : null,
        configured: Boolean(token),
        errorMessage: null,
        status: token ? 'connected' : 'not-configured',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.applyTelegramState({
        ...this.snapshot.externalChannels.telegram,
        botUsername: null,
        configured: Boolean(token),
        errorMessage: errorMessage.startsWith('Telegram failed to connect')
          ? errorMessage
          : `Telegram failed to connect. ${String(error)}`,
        status: token ? 'error' : 'not-configured',
      });
    }
  }

  reset() {
    this.clearPendingAssistantMessages();
    this.persistedAgents.clear();
    const nextExternalChannels = cloneExternalChannelsState(this.snapshot.externalChannels);
    nextExternalChannels.telegram.discoveredChats = [];
    this.snapshot = {
      agents: [],
      externalChannels: nextExternalChannels,
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

  private createAgent(input: CreateAgentInput) {
    const trimmedName = input.name.trim();

    if (!trimmedName) {
      throw new Error('Agent name is required.');
    }

    if (input.channelId === 'telegram') {
      if (!input.externalTarget || input.externalTarget.channelId !== 'telegram') {
        throw new Error('Telegram chat selection is required.');
      }

      if (this.isTelegramChatBound(input.externalTarget.jid)) {
        throw new Error('That Telegram chat is already attached to another agent.');
      }
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
      this.snapshot.externalChannels,
      input.externalTarget ?? null,
      input.projectId ?? null,
    );

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

    this.agentLite?.registerGroup(resolveAgentGroupJid(nextAgent), {
      folder: groupFolder,
      name: trimmedName,
      requiresTrigger: false,
    });

    return agentId;
  }

  private deleteAgent(agentId: string) {
    if (!this.persistedAgents.has(agentId)) {
      return;
    }

    this.clearPendingAssistantMessage(agentId);
    this.persistedAgents.delete(agentId);
    const nextAgents = this.snapshot.agents.filter((agent) => agent.id !== agentId);
    const nextSelectedAgentId = this.snapshot.selectedAgentId === agentId
      ? nextAgents[0]?.id ?? null
      : this.snapshot.selectedAgentId;

    this.snapshot = {
      ...this.snapshot,
      agents: nextAgents,
      isStreaming: this.pendingAssistantMessages.size > 0,
      selectedAgentId: nextSelectedAgentId,
    };
    this.persistState();
    this.emit();
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

  private isTelegramChatBound(chatJid: string) {
    return this.snapshot.agents.some((agent) => agent.channel.target?.jid === chatJid);
  }

  private findAgentByTelegramChat(chatJid: string) {
    return this.snapshot.agents.find((agent) => agent.channel.target?.jid === chatJid) ?? null;
  }

  private handleTelegramChatMetadata(
    chatJid: string,
    timestamp: string,
    name?: string,
    isGroup?: boolean,
  ) {
    if (!chatJid.startsWith('tg:')) {
      return;
    }

    const fallbackNow = this.now();
    const existingChat = this.snapshot.externalChannels.telegram.discoveredChats.find(
      (chat) => chat.jid === chatJid,
    ) ?? null;
    const nextChat: DiscoveredExternalChat = {
      channelId: 'telegram',
      jid: chatJid,
      kind: isGroup ? 'group' : 'dm',
      lastSeenAt: parseMessageTimestamp(timestamp, fallbackNow),
      name: name?.trim() || existingChat?.name || chatJid,
    };
    const previousChats = this.snapshot.externalChannels.telegram.discoveredChats;
    const nextChats = [
      nextChat,
      ...previousChats.filter((chat) => chat.jid !== chatJid),
    ]
      .map((chat) =>
        chat.jid === chatJid && existingChat
          ? {
              ...chat,
              kind: nextChat.kind,
              lastSeenAt: Math.max(chat.lastSeenAt, existingChat.lastSeenAt),
              name: nextChat.name || existingChat.name,
            }
          : chat,
      )
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

    console.info('Recorded discovered Telegram chat.', {
      chatJid,
      kind: nextChat.kind,
      name: nextChat.name,
    });

    this.applyTelegramState({
      ...this.snapshot.externalChannels.telegram,
      discoveredChats: nextChats,
    });
  }

  private handleTelegramInboundMessage(chatJid: string, message: NewMessage) {
    const agent = this.findAgentByTelegramChat(chatJid);

    if (!agent) {
      return;
    }

    const mirroredMessageId = createMirroredMessageId('user', chatJid, message.id);

    if (agent.messages.some((item) => item.id === mirroredMessageId)) {
      return;
    }

    const now = parseMessageTimestamp(message.timestamp, this.now());
    const senderName = message.sender_name?.trim();
    const content = agent.channel.target?.kind === 'group' && senderName
      ? `${senderName}: ${message.content}`
      : message.content;

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agent.id
          ? {
              ...item,
              messages: [
                ...item.messages,
                {
                  content,
                  createdAt: now,
                  id: mirroredMessageId,
                  role: 'user',
                  status: 'complete',
                },
              ],
              preview: summarizePreview(content),
              updatedAt: now,
            }
          : item,
      ),
    };
    this.persistState();
    this.emit();
  }

  private handleTelegramOutboundMessage(chatJid: string, text: string) {
    const agent = this.findAgentByTelegramChat(chatJid);

    if (!agent) {
      return;
    }

    const now = this.now();

    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((item) =>
        item.id === agent.id
          ? {
              ...item,
              messages: [
                ...item.messages,
                {
                  content: text,
                  createdAt: now,
                  id: createMirroredMessageId(
                    'assistant',
                    chatJid,
                    `${now}-${Math.random().toString(36).slice(2, 8)}`,
                  ),
                  role: 'assistant',
                  status: 'complete',
                },
              ],
              preview: summarizePreview(text),
              status: 'ready',
              updatedAt: now,
            }
          : item,
      ),
    };
    this.persistState();
    this.emit();
  }

  private applyTelegramState(nextTelegramState: ExternalChannelsState['telegram']) {
    this.snapshot = {
      ...this.snapshot,
      agents: this.snapshot.agents.map((agent) =>
        agent.channel.id === 'telegram'
          ? {
              ...agent,
              channel: createChannelBinding(
                'telegram',
                { telegram: nextTelegramState },
                agent.channel.target ?? null,
              ),
            }
          : agent,
      ),
      externalChannels: {
        ...this.snapshot.externalChannels,
        telegram: {
          ...nextTelegramState,
          discoveredChats: nextTelegramState.discoveredChats.map((chat) => ({ ...chat })),
        },
      },
    };
    this.persistState();
    this.emit();
  }

  private async loadPersistedState() {
    try {
      const agents = await this.agentStore.get<PersistedAgentRecord[]>('agents') ?? [];
      const externalChannels = await this.agentStore.get<ExternalChannelsState>('externalChannels');
      const selectedAgentId = await this.agentStore.get<string | null>('selectedAgentId');
      const telegramTokenFingerprint = await this.agentStore.get<string | null>('telegramTokenFingerprint');

      this.persistedTelegramTokenFingerprint = telegramTokenFingerprint ?? null;

      this.persistedAgents.clear();

      for (const record of agents) {
        this.persistedAgents.set(record.agent.id, record);
      }

      this.snapshot = {
        ...this.snapshot,
        agents: agents.map((record) => record.agent),
        externalChannels: externalChannels
          ? cloneExternalChannelsState(externalChannels)
          : createDefaultExternalChannelsState(),
        selectedAgentId: selectedAgentId ?? null,
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
    void this.agentStore.set('agents', [...this.persistedAgents.values()]);
    void this.agentStore.set('externalChannels', cloneExternalChannelsState(this.snapshot.externalChannels));
    void this.agentStore.set('selectedAgentId', this.snapshot.selectedAgentId);
    void this.agentStore.set('telegramTokenFingerprint', this.persistedTelegramTokenFingerprint);
  }

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
