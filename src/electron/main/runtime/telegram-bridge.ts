// Telegram bridge and setup-session orchestration.

import { createHash } from 'node:crypto';

import { createId } from '@/shared/id';

import type {
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import type {
  Agent,
  AgentChannelBinding,
  AgentExternalTarget,
  DiscoveredExternalChat,
  StartTelegramSetupSessionInput,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
  TelegramPairingStatus,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import {
  cloneTelegramSetupSession,
  createDefaultTelegramAgentRuntimeState,
} from '@/renderer/features/agents/model/channels';
import { extractWorkspaceAttachmentPaths } from '@/shared/agents/message-content';
import { createChannelBinding as createAgentRuntimeChannelBinding } from './agent-runtime/channels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TELEGRAM_PAIR_CODE_TTL_MS = 10 * 60 * 1000;

// grammy's bot.start() resolves only once getMe succeeds and polling begins.
// If the network is broken or the token is wrong, it can hang indefinitely —
// keeping the "Save token" button stuck in "Saving…". Bound the wait so the
// bridge surfaces a proper error instead of blocking the IPC call.
const TELEGRAM_DRIVER_CONNECT_TIMEOUT_MS = 15_000;

/** Connects driver with timeout. */
function connectDriverWithTimeout(
  driver: ChannelDriver,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(
        `Telegram bot did not respond within ${Math.round(timeoutMs / 1000)}s. `
          + 'Check the bot token and network (Settings → Network).',
      ));
    }, timeoutMs);

    driver
      .connect()
      .then(() => {
        globalThis.clearTimeout(timeoutId);
        resolve();
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

const TELEGRAM_OBSERVER_GROUP = Object.freeze({
  added_at: new Date(0).toISOString(),
  folder: 'telegram-observer',
  name: 'Telegram Observer',
  requiresTrigger: false,
  trigger: '@Dune',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fingerprints Telegram token. */
function fingerprintTelegramToken(token: string) {
  if (!token) {
    return null;
  }

  return createHash('sha256').update(token).digest('hex');
}

/** Creates Telegram pair code. */
function createTelegramPairCode(length: number = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'A';
  }

  return code;
}

/** Creates Telegram agent token key. */
function createTelegramAgentTokenKey(agentId: string) {
  return `agent:${agentId}:telegram:bot-token`;
}

/** Parses message timestamp. */
function parseMessageTimestamp(timestamp: string, fallback: number) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Creates external agent copy. */
function createExternalAgentCopy(attachedLabel: string) {
  return {
    note: `This agent is bound to ${attachedLabel} and mirrors its transcript through the Dune host.`,
    preview: `Attached to ${attachedLabel}. Dune mirrors the transcript.`,
  };
}

/** Creates channel binding. */
function createChannelBinding(
  telegramState: TelegramAgentRuntimeState | null,
  target: AgentExternalTarget | null = null,
): AgentChannelBinding {
  return createAgentRuntimeChannelBinding('telegram', telegramState, target);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Telegram secrets store contract. */
export interface TelegramSecretsStore {
  delete: (key: string) => Promise<void>;
  get: <T>(key: string) => Promise<T | null>;
  keys?: () => Promise<string[]>;
  set: <T>(key: string, value: T) => Promise<void>;
}

/** Callbacks from bridge -> host (general-named for future channel reuse). */
export interface ChannelBridgeCallbacks {
  getAgents: () => Agent[];
  now: () => number;
  onChange: () => Promise<void> | void;
}

/** Patch returned by syncAgentPatches — host applies to its snapshot. */
export interface AgentChannelPatch {
  agentId: string;
  channel: AgentChannelBinding;
  note: string;
  preview: string;
  telegram: TelegramAgentRuntimeState;
}

/** Telegram bridge options. */
export interface TelegramBridgeOptions {
  callbacks: ChannelBridgeCallbacks;
  createChannelFactory: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;
  resolveBotUsername: (token: string) => Promise<string | null>;
  secretsStore: TelegramSecretsStore;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Telegram observer record shape. */
interface TelegramObserverRecord {
  botUsername: string | null;
  driver: ChannelDriver | null;
  errorMessage: string | null;
  fingerprint: string;
  status: TelegramConnectionStatus;
  token: string;
}

/** Telegram setup session record shape. */
interface TelegramSetupSessionRecord {
  agentId: string | null;
  botUsername: string | null;
  code: string;
  errorMessage: string | null;
  expiresAt: number;
  id: string;
  matchedChat: AgentExternalTarget | null;
  pairingStatus: TelegramPairingStatus;
  status: TelegramConnectionStatus;
  timeout: ReturnType<typeof globalThis.setTimeout> | null;
  token: string;
  tokenFingerprint: string;
}

// ---------------------------------------------------------------------------
// TelegramBridge
// ---------------------------------------------------------------------------

/** Bridges Telegram setup state and channel connections. */
export class TelegramBridge {
  private readonly callbacks: ChannelBridgeCallbacks;

  private readonly createChannelFactory: (token: string) => ChannelDriverFactory | Promise<ChannelDriverFactory>;

  private readonly resolveBotUsername: (token: string) => Promise<string | null>;

  private readonly secretsStore: TelegramSecretsStore;

  private readonly observers = new Map<string, TelegramObserverRecord>();

  private readonly setupSessions = new Map<string, TelegramSetupSessionRecord>();

  private readonly knownChats = new Map<string, Map<string, DiscoveredExternalChat>>();

  private readonly agentFingerprints = new Map<string, string>();

  constructor(options: TelegramBridgeOptions) {
    this.callbacks = options.callbacks;
    this.createChannelFactory = options.createChannelFactory;
    this.resolveBotUsername = options.resolveBotUsername;
    this.secretsStore = options.secretsStore;
  }

  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  /** Reads agent token. */
  async readAgentToken(agentId: string) {
    const value = await this.secretsStore.get<string>(createTelegramAgentTokenKey(agentId));
    return typeof value === 'string' ? value.trim() : '';
  }

  /** Writes agent token. */
  async writeAgentToken(agentId: string, token: string) {
    await this.secretsStore.set(createTelegramAgentTokenKey(agentId), token.trim());
  }

  /** Deletes agent token. */
  async deleteAgentToken(agentId: string) {
    await this.secretsStore.delete(createTelegramAgentTokenKey(agentId));
  }

  // -------------------------------------------------------------------------
  // Setup sessions
  // -------------------------------------------------------------------------

  /** Starts setup session. */
  async startSetupSession(input: StartTelegramSetupSessionInput): Promise<string> {
    const agentId = input.agentId?.trim() ?? null;
    const providedToken = input.token?.trim() ?? '';
    const token = providedToken || (agentId ? await this.readAgentToken(agentId) : '');

    if (!token) {
      throw new Error('Telegram bot token is required.');
    }

    if (agentId) {
      for (const existingSession of [...this.setupSessions.values()]) {
        if (existingSession.agentId === agentId) {
          this.clearSetupSession(existingSession.id);
        }
      }
    }

    const sessionId = createId('telegram-session');
    const expiresAt = this.callbacks.now() + TELEGRAM_PAIR_CODE_TTL_MS;
    const tokenFingerprint = fingerprintTelegramToken(token);

    if (!tokenFingerprint) {
      throw new Error('Telegram bot token is invalid.');
    }

    const timeout = globalThis.setTimeout(() => {
      const session = this.setupSessions.get(sessionId);

      if (!session) {
        return;
      }

      session.pairingStatus = 'expired';
      session.timeout = null;
      void this.callbacks.onChange();
    }, TELEGRAM_PAIR_CODE_TTL_MS);

    const session: TelegramSetupSessionRecord = {
      agentId,
      botUsername: null,
      code: createTelegramPairCode(),
      errorMessage: null,
      expiresAt,
      id: sessionId,
      matchedChat: null,
      pairingStatus: 'listening',
      status: 'connecting',
      timeout,
      token,
      tokenFingerprint,
    };

    this.setupSessions.set(sessionId, session);
    await this.callbacks.onChange();
    await this.refreshRuntimeState();

    return sessionId;
  }

  /** Cancels setup session. */
  async cancelSetupSession(sessionId: string) {
    this.clearSetupSession(sessionId);
    await this.refreshRuntimeState();
  }

  /** Returns setup session. */
  getSetupSession(sessionId: string): TelegramSetupSession | null {
    const session = this.setupSessions.get(sessionId) ?? null;
    return session ? cloneTelegramSetupSession(this.toPublicSetupSession(session)) : null;
  }

  /** Returns setup session record. */
  getSetupSessionRecord(sessionId: string): TelegramSetupSessionRecord | null {
    return this.setupSessions.get(sessionId) ?? null;
  }

  /** Lists setup sessions. */
  listSetupSessions(): TelegramSetupSession[] {
    return [...this.setupSessions.values()].map((session) =>
      this.toPublicSetupSession(session),
    );
  }

  /** Consumes setup session. */
  consumeSetupSession(sessionId: string) {
    this.clearSetupSession(sessionId);
  }

  /** Clears all setup sessions. */
  clearAllSetupSessions() {
    for (const session of [...this.setupSessions.values()]) {
      this.clearSetupSession(session.id);
    }
  }

  // -------------------------------------------------------------------------
  // Observer management
  // -------------------------------------------------------------------------

  /** Refreshes runtime state. */
  async refreshRuntimeState(
    options: { forceReconnect?: boolean } = {},
  ) {
    const requiredTokens = new Map<string, string>();
    const requiredObserverMembers = new Map<
      string,
      { agentIds: Set<string>; sessionIds: Set<string> }
    >();

    this.agentFingerprints.clear();

    // Build the agent→fingerprint mapping but do NOT create observers for
    // already-bound agents. Their external driver (via DuneChannel) handles
    // all Telegram polling. Observers are only needed for setup sessions.
    for (const agent of this.callbacks.getAgents()) {
      if (agent.channel.id !== 'telegram') {
        continue;
      }

      const token = await this.readAgentToken(agent.id);

      if (!token) {
        continue;
      }

      const fingerprint = fingerprintTelegramToken(token);

      if (!fingerprint) {
        continue;
      }

      this.agentFingerprints.set(agent.id, fingerprint);
    }

    for (const session of this.setupSessions.values()) {
      requiredTokens.set(session.tokenFingerprint, session.token);
      const members = requiredObserverMembers.get(session.tokenFingerprint) ?? {
        agentIds: new Set<string>(),
        sessionIds: new Set<string>(),
      };
      members.sessionIds.add(session.id);
      requiredObserverMembers.set(session.tokenFingerprint, members);
    }

    for (const [fingerprint] of [...this.observers.entries()]) {
      if (options.forceReconnect || !requiredTokens.has(fingerprint)) {
        await this.disconnectObserver(fingerprint);
      }
    }

    for (const [fingerprint, token] of requiredTokens.entries()) {
      let observer = this.observers.get(fingerprint) ?? null;

      if (!observer) {
        let driver: ChannelDriver | null = null;

        try {
          driver = await this.createObserver(token, fingerprint);
          await connectDriverWithTimeout(driver, TELEGRAM_DRIVER_CONNECT_TIMEOUT_MS);
          let botUsername: string | null = null;

          try {
            botUsername = await this.resolveBotUsername(token);
          } catch (error) {
            console.warn('Failed to resolve Telegram bot username.', error);
          }

          observer = {
            botUsername,
            driver,
            errorMessage: null,
            fingerprint,
            status: 'connected',
            token,
          };
        } catch (error) {
          // Disconnect the hung/failed driver so it doesn't keep polling in the
          // background while we surface the error to the UI.
          if (driver) {
            try {
              await driver.disconnect();
            } catch (disconnectError) {
              console.warn('Failed to disconnect a stalled Telegram driver.', disconnectError);
            }
          }

          observer = {
            botUsername: null,
            driver: null,
            errorMessage: error instanceof Error ? error.message : String(error),
            fingerprint,
            status: 'error',
            token,
          };
        }

        this.observers.set(fingerprint, observer);
      }

      const members = requiredObserverMembers.get(fingerprint);

      if (!members) {
        continue;
      }

      for (const sessionId of members.sessionIds) {
        const session = this.setupSessions.get(sessionId);

        if (!session) {
          continue;
        }

        session.botUsername = observer.botUsername;
        session.errorMessage = observer.errorMessage;
        session.status = observer.status;
      }
    }

    await this.callbacks.onChange();
  }

  /** Returns patches for Telegram agents — host applies them to the snapshot. */
  syncAgentPatches(): AgentChannelPatch[] {
    const sessionsByAgentId = new Map<string, TelegramSetupSessionRecord>();

    for (const session of this.setupSessions.values()) {
      if (session.agentId) {
        sessionsByAgentId.set(session.agentId, session);
      }
    }

    const patches: AgentChannelPatch[] = [];

    for (const agent of this.callbacks.getAgents()) {
      if (agent.channel.id !== 'telegram') {
        continue;
      }

      const fingerprint = this.agentFingerprints.get(agent.id) ?? null;
      const observer = fingerprint ? this.observers.get(fingerprint) ?? null : null;
      const activeSession = sessionsByAgentId.get(agent.id) ?? null;
      const boundChat = activeSession?.matchedChat ?? agent.channel.target ?? agent.telegram?.boundChat ?? null;
      const telegramState = createDefaultTelegramAgentRuntimeState({
        botUsername: activeSession?.botUsername ?? observer?.botUsername ?? agent.telegram?.botUsername ?? null,
        boundChat,
        errorMessage:
          activeSession?.errorMessage
          ?? observer?.errorMessage
          ?? (fingerprint ? agent.telegram?.errorMessage ?? null : 'Telegram bot token is missing. Reconfigure this agent.'),
        pairCode: activeSession?.pairingStatus === 'listening' ? activeSession.code : null,
        pairExpiresAt: activeSession?.pairingStatus === 'listening' ? activeSession.expiresAt : null,
        pairingStatus: activeSession?.pairingStatus ?? 'idle',
        status: activeSession?.status ?? observer?.status ?? 'error',
      });
      const attachedLabel = boundChat?.name ?? agent.channel.label;
      const copy = boundChat ? createExternalAgentCopy(attachedLabel) : {
        note: 'This Telegram agent needs a bot token and a claimed chat before it can mirror messages.',
        preview: 'Telegram needs to be configured for this agent.',
      };

      patches.push({
        agentId: agent.id,
        channel: createChannelBinding(telegramState, boundChat),
        note: copy.note,
        preview: copy.preview,
        telegram: telegramState,
      });
    }

    return patches;
  }

  // sendReply removed — DuneChannel's external driver handles outbound delivery.

  /** Disconnects all. */
  async disconnectAll() {
    for (const fingerprint of [...this.observers.keys()]) {
      await this.disconnectObserver(fingerprint);
    }
  }

  /** Resets Telegram. */
  reset() {
    this.agentFingerprints.clear();
    this.knownChats.clear();
    this.clearAllSetupSessions();
  }

  /** Deletes agent fingerprint. */
  deleteAgentFingerprint(agentId: string) {
    this.agentFingerprints.delete(agentId);
  }

  /** Disconnect the observer for an agent's token so the external driver can poll. */
  async disconnectAgentObserver(agentId: string) {
    const fingerprint = this.agentFingerprints.get(agentId) ?? null;

    if (!fingerprint) {
      return;
    }

    // Only disconnect if no other agents share this observer.
    const otherAgents = [...this.agentFingerprints.entries()]
      .filter(([id, fp]) => fp === fingerprint && id !== agentId);

    if (otherAgents.length === 0) {
      await this.disconnectObserver(fingerprint);
    }
  }

  /** Clears agent setup sessions. */
  clearAgentSetupSessions(agentId: string) {
    for (const session of [...this.setupSessions.values()]) {
      if (session.agentId === agentId) {
        this.clearSetupSession(session.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Session-to-agent binding
  // -------------------------------------------------------------------------

  /** Applies matched session to agent. */
  async applyMatchedSessionToAgent(session: TelegramSetupSessionRecord) {
    if (!session.agentId || !session.matchedChat) {
      return;
    }

    const observer = this.observers.get(session.tokenFingerprint) ?? null;
    const nextTelegramState = createDefaultTelegramAgentRuntimeState({
      botUsername: session.botUsername ?? observer?.botUsername ?? null,
      boundChat: session.matchedChat,
      errorMessage: session.errorMessage ?? observer?.errorMessage ?? null,
      pairingStatus: 'matched',
      status: session.status,
    });
    const attachedLabel = session.matchedChat.name;
    const copy = createExternalAgentCopy(attachedLabel);

    await this.writeAgentToken(session.agentId, session.token);
    this.agentFingerprints.set(session.agentId, session.tokenFingerprint);

    // Return patch data instead of mutating snapshot directly.
    // The host will apply this and then call refreshRuntimeState.
    const patch: AgentChannelPatch = {
      agentId: session.agentId,
      channel: createChannelBinding(nextTelegramState, session.matchedChat),
      note: copy.note,
      preview: copy.preview,
      telegram: nextTelegramState,
    };

    return patch;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private clearSetupSession(sessionId: string) {
    const session = this.setupSessions.get(sessionId);

    if (!session) {
      return;
    }

    if (session.timeout) {
      globalThis.clearTimeout(session.timeout);
    }

    this.setupSessions.delete(sessionId);
  }

  private async createObserver(token: string, fingerprint: string) {
    const createChannel = await this.createChannelFactory(token);
    const registeredGroups = new Proxy<Record<string, unknown>>(
      {},
      {
        get: (_target, property) =>
          typeof property === 'string' && property.startsWith('tg:')
            ? TELEGRAM_OBSERVER_GROUP
            : undefined,
      },
    );
    const config: ChannelDriverConfig = {
      onChatMetadata: (chatJid, timestamp, name, _channel, isGroup) => {
        this.handleChatMetadata(fingerprint, chatJid, timestamp, name, isGroup);
      },
      onMessage: (chatJid, message) =>
        this.handleObserverMessage(fingerprint, chatJid, message),
      registeredGroups: () => registeredGroups,
    };

    return createChannel(config);
  }

  private async disconnectObserver(fingerprint: string) {
    const observer = this.observers.get(fingerprint);

    if (!observer) {
      return;
    }

    this.observers.delete(fingerprint);

    try {
      await observer.driver?.disconnect();
    } catch (error) {
      console.warn('Failed to disconnect a Telegram observer cleanly.', error);
    }
  }

  private handleChatMetadata(
    fingerprint: string,
    chatJid: string,
    timestamp: string,
    name?: string,
    isGroup?: boolean,
  ) {
    if (!chatJid.startsWith('tg:') || chatJid === 'tg:bot') {
      return;
    }

    const chats = this.knownChats.get(fingerprint) ?? new Map<string, DiscoveredExternalChat>();
    const fallbackNow = this.callbacks.now();
    const existingChat = chats.get(chatJid) ?? null;
    const nextChat: DiscoveredExternalChat = {
      channelId: 'telegram',
      jid: chatJid,
      kind: isGroup ? 'group' : 'dm',
      lastSeenAt: parseMessageTimestamp(timestamp, fallbackNow),
      name: name?.trim() || existingChat?.name || chatJid,
    };

    chats.set(chatJid, nextChat);
    this.knownChats.set(fingerprint, chats);
  }

  private buildMatchedChat(
    fingerprint: string,
    chatJid: string,
    message: { sender_name?: string },
  ): AgentExternalTarget {
    const discoveredChat = this.knownChats.get(fingerprint)?.get(chatJid) ?? null;

    return discoveredChat
      ? {
          channelId: 'telegram',
          jid: discoveredChat.jid,
          kind: discoveredChat.kind,
          name: discoveredChat.name,
        }
      : {
          channelId: 'telegram',
          jid: chatJid,
          kind: 'dm',
          name: message.sender_name?.trim() || chatJid,
        };
  }

  private async handleObserverMessage(
    fingerprint: string,
    chatJid: string,
    message: {
      attachments?: string[];
      content: string;
      is_bot_message?: boolean;
      is_from_me: boolean;
      sender: string;
      sender_name?: string;
      timestamp: string;
    },
  ) {
    if (!chatJid.startsWith('tg:') || message.is_from_me || message.is_bot_message) {
      return;
    }

    const trimmedContent = message.content.trim();
    const pairMatch = trimmedContent.match(/^\/pair\s+([A-Z0-9-]+)$/i);
    const submittedCode = pairMatch?.[1]?.trim().toUpperCase() ?? null;

    if (submittedCode) {
      const setupSession = [...this.setupSessions.values()].find((session) =>
        session.tokenFingerprint === fingerprint
          && session.code === submittedCode
          && session.pairingStatus === 'listening',
      ) ?? null;

      if (setupSession) {
        const matchedChat = this.buildMatchedChat(fingerprint, chatJid, message);
        setupSession.botUsername = this.observers.get(fingerprint)?.botUsername ?? null;
        setupSession.errorMessage = null;
        setupSession.matchedChat = matchedChat;
        setupSession.pairingStatus = 'matched';
        setupSession.timeout && globalThis.clearTimeout(setupSession.timeout);
        setupSession.timeout = null;

        if (setupSession.agentId) {
          const patch = await this.applyMatchedSessionToAgent(setupSession);

          if (patch) {
            // The host applies this patch via onChange callback.
            // Store on the session so the host can retrieve it.
            await this.callbacks.onChange();
          }
        } else {
          await this.callbacks.onChange();
        }

        return;
      }
    }

    // Inbound message routing is handled by the external driver attached to
    // DuneChannel. The observer only needs to run for the /pair setup flow.
    // DuneChannel.onExternalInbound records the user message in the snapshot,
    // and the external driver delivers it to AgentLite.
  }

  private toPublicSetupSession(
    session: TelegramSetupSessionRecord,
  ): TelegramSetupSession {
    return {
      agentId: session.agentId,
      botUsername: session.botUsername,
      errorMessage: session.errorMessage,
      id: session.id,
      matchedChat: session.matchedChat ? { ...session.matchedChat } : null,
      pairCode: session.pairingStatus === 'listening' ? session.code : null,
      pairExpiresAt: session.pairingStatus === 'listening' ? session.expiresAt : null,
      pairingStatus: session.pairingStatus,
      status: session.status,
    };
  }
}
