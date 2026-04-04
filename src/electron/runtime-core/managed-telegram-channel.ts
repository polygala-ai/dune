import type { TelegramChannelOpts } from '@boxlite-ai/agentlite/channels/telegram';

export interface ManagedTelegramChannelHooks {
  onChatMetadata: (
    chatJid: string,
    timestamp: string,
    name?: string,
    channel?: string,
    isGroup?: boolean,
  ) => void;
  onInboundMessage: (
    chatJid: string,
    message: {
      chat_jid: string;
      content: string;
      id: string;
      is_bot_message?: boolean;
      is_from_me: boolean;
      sender: string;
      sender_name?: string;
      timestamp: string;
    },
  ) => void;
  onOutboundMessage: (chatJid: string, text: string) => void;
}

export interface RuntimeTelegramChannel {
  _setOpts?: (callbacks: TelegramChannelOpts) => void;
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  getBotUsername: () => string | null;
  isConnected: () => boolean;
  name: string;
  ownsJid: (jid: string) => boolean;
  reconfigure: (token: string | null) => Promise<void>;
  reset: () => Promise<void> | void;
  sendMessage: (jid: string, text: string) => Promise<void> | void;
  setTyping?: (jid: string, isTyping: boolean) => Promise<void> | void;
}

interface TelegramChannelInstance {
  _setOpts: (callbacks: TelegramChannelOpts) => void;
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  getBotUsername?: () => string | null;
  isConnected: () => boolean;
  sendMessage: (jid: string, text: string) => Promise<void> | void;
  setTyping?: (jid: string, isTyping: boolean) => Promise<void> | void;
}

interface ManagedTelegramChannelOptions {
  createChannel?: (
    token: string,
  ) => TelegramChannelInstance | Promise<TelegramChannelInstance>;
  connectTimeoutMs?: number;
}

function isWorkerExitedLoggerError(error: unknown) {
  return error instanceof Error && error.message.includes('the worker has exited');
}

type TelegramChannelModule = typeof import('@boxlite-ai/agentlite/channels/telegram');

// Electron Forge builds the main process as CJS. Use a runtime import here so
// AgentLite's ESM subpath can still load from the installed package.
const importTelegramChannelModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<TelegramChannelModule>;

export class ManagedTelegramChannel implements RuntimeTelegramChannel {
  name = 'telegram';

  private callbacks: TelegramChannelOpts = {
    onChatMetadata: () => {},
    onMessage: () => {},
    registeredGroups: () => ({}),
  };

  private readonly createChannel: (
    token: string,
  ) => TelegramChannelInstance | Promise<TelegramChannelInstance>;

  private innerChannel: TelegramChannelInstance | null = null;

  private botUsername: string | null = null;

  private readonly connectTimeoutMs: number;

  private token: string | null = null;

  constructor(
    private readonly hooks: ManagedTelegramChannelHooks,
    options: ManagedTelegramChannelOptions = {},
  ) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
    this.createChannel =
      options.createChannel ??
      (async (token) => {
        const { TelegramChannel } = await importTelegramChannelModule(
          '@boxlite-ai/agentlite/channels/telegram',
        );

        return new TelegramChannel({ token });
      });
  }

  _setOpts(callbacks: TelegramChannelOpts) {
    this.callbacks = callbacks;
    this.innerChannel?._setOpts(this.buildCallbacks());
  }

  async connect() {
    if (!this.innerChannel) {
      return;
    }

    if (this.innerChannel.isConnected()) {
      return;
    }

    await this.connectWithTimeout(this.innerChannel);
    this.updateBotUsername(this.innerChannel);
  }

  async disconnect() {
    await this.disconnectCurrentChannel();
  }

  getBotUsername() {
    return this.botUsername;
  }

  isConnected() {
    return this.innerChannel?.isConnected() ?? false;
  }

  ownsJid(jid: string) {
    return jid.startsWith('tg:');
  }

  async reconfigure(token: string | null) {
    const nextToken = token?.trim() ? token.trim() : null;

    if (!nextToken) {
      this.token = null;
      await this.disconnectCurrentChannel();
      return;
    }

    if (!this.innerChannel || this.token !== nextToken) {
      await this.disconnectCurrentChannel();
      this.token = nextToken;
      this.innerChannel = await this.createChannel(nextToken);
      this.innerChannel._setOpts(this.buildCallbacks());
    }

    if (!this.innerChannel.isConnected()) {
      await this.connectWithTimeout(this.innerChannel);
    }

    this.updateBotUsername(this.innerChannel);
  }

  async sendMessage(jid: string, text: string) {
    if (!this.innerChannel || !this.innerChannel.isConnected()) {
      return;
    }

    await this.innerChannel.sendMessage(jid, text);
    this.hooks.onOutboundMessage(jid, text);
  }

  async setTyping(jid: string, isTyping: boolean) {
    if (!this.innerChannel || typeof this.innerChannel.setTyping !== 'function') {
      return;
    }

    await this.innerChannel.setTyping(jid, isTyping);
  }

  reset() {
    this.clearState();
  }

  private clearState() {
    this.botUsername = null;
    this.innerChannel = null;
    this.token = null;
  }

  private updateBotUsername(channel: TelegramChannelInstance | null) {
    this.botUsername = this.readBotUsername(channel);
  }

  private async connectWithTimeout(channel: TelegramChannelInstance) {
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    try {
      await Promise.race([
        Promise.resolve(channel.connect()),
        new Promise<never>((_, reject) => {
          timeoutHandle = globalThis.setTimeout(() => {
            reject(new Error(
              `Telegram failed to connect within ${Math.round(this.connectTimeoutMs / 1000)}s. Check the Network settings or proxy configuration.`,
            ));
          }, this.connectTimeoutMs);
        }),
      ]);
    } catch (error) {
      await this.handleConnectFailure(channel);
      throw error;
    } finally {
      if (timeoutHandle) {
        globalThis.clearTimeout(timeoutHandle);
      }
    }
  }

  private readBotUsername(channel: TelegramChannelInstance | null) {
    if (!channel) {
      return null;
    }

    const explicitUsername = channel.getBotUsername?.();

    if (explicitUsername) {
      return explicitUsername.replace(/^@+/, '').trim() || null;
    }

    const maybeBot = (
      channel as TelegramChannelInstance & {
        bot?: {
          botInfo?: { username?: string };
          me?: { username?: string };
        };
      }
    ).bot;
    const username = maybeBot?.botInfo?.username ?? maybeBot?.me?.username;

    return username ? username.replace(/^@+/, '').trim() || null : null;
  }

  private async disconnectCurrentChannel() {
    const currentChannel = this.innerChannel;

    if (!currentChannel) {
      return;
    }

    try {
      await currentChannel.disconnect();
    } catch (error) {
      if (!isWorkerExitedLoggerError(error)) {
        throw error;
      }

      console.warn(
        'Suppressing Telegram disconnect error after channel teardown because the logger worker already exited.',
        error,
      );
    }

    if (this.innerChannel === currentChannel) {
      this.clearState();
    }
  }

  private async handleConnectFailure(channel: TelegramChannelInstance) {
    try {
      await channel.disconnect();
    } catch (error) {
      console.warn(
        isWorkerExitedLoggerError(error)
          ? 'Suppressing Telegram disconnect error after channel teardown because the logger worker already exited.'
          : 'Telegram cleanup after a failed connect also failed.',
        error,
      );
    } finally {
      if (this.innerChannel === channel) {
        this.clearState();
      }
    }
  }

  private buildCallbacks(): TelegramChannelOpts {
    return {
      onChatMetadata: (chatJid, timestamp, name, channel, isGroup) => {
        this.callbacks.onChatMetadata(chatJid, timestamp, name, channel, isGroup);
        this.hooks.onChatMetadata(chatJid, timestamp, name, channel, isGroup);
      },
      onMessage: (chatJid, message) => {
        this.callbacks.onMessage(chatJid, message);
        this.hooks.onInboundMessage(chatJid, {
          chat_jid: message.chat_jid,
          content: message.content,
          id: message.id,
          ...(message.is_bot_message !== undefined
            ? { is_bot_message: message.is_bot_message }
            : {}),
          is_from_me: message.is_from_me ?? false,
          sender: message.sender,
          ...(message.sender_name ? { sender_name: message.sender_name } : {}),
          timestamp: message.timestamp,
        });
      },
      registeredGroups: () => this.callbacks.registeredGroups(),
    };
  }
}
