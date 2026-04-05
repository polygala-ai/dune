import type { Channel, ChannelOpts } from '@boxlite-ai/agentlite';

interface SwappableChannelProxyOptions<TConfig> {
  channelOptions: ChannelOpts;
  connectTimeoutMs?: number;
  createChannel: (config: TConfig, channelOptions: ChannelOpts) => Channel | Promise<Channel>;
  name: string;
  onOutboundMessage?: (jid: string, text: string) => Promise<void> | void;
  ownsJid: (jid: string) => boolean;
  readIdentity?: (channel: Channel | null) => string | null;
  timeoutMessage: string;
}

function isWorkerExitedLoggerError(error: unknown) {
  return error instanceof Error && error.message.includes('the worker has exited');
}

export class SwappableChannelProxy<TConfig> implements Channel {
  readonly name: string;

  private innerChannel: Channel | null = null;

  private config: TConfig | null = null;

  private identity: string | null = null;

  private readonly channelOptions: ChannelOpts;

  private readonly connectTimeoutMs: number;

  private readonly createChannel: (
    config: TConfig,
    channelOptions: ChannelOpts,
  ) => Channel | Promise<Channel>;

  private readonly onOutboundMessage: SwappableChannelProxyOptions<TConfig>['onOutboundMessage'];

  private readonly ownsJidMatcher: SwappableChannelProxyOptions<TConfig>['ownsJid'];

  private readonly readIdentity: (channel: Channel | null) => string | null;

  private readonly timeoutMessage: string;

  constructor({
    channelOptions,
    connectTimeoutMs = 15_000,
    createChannel,
    name,
    onOutboundMessage,
    ownsJid,
    readIdentity = () => null,
    timeoutMessage,
  }: SwappableChannelProxyOptions<TConfig>) {
    this.channelOptions = channelOptions;
    this.connectTimeoutMs = connectTimeoutMs;
    this.createChannel = createChannel;
    this.name = name;
    this.onOutboundMessage = onOutboundMessage;
    this.ownsJidMatcher = ownsJid;
    this.readIdentity = readIdentity;
    this.timeoutMessage = timeoutMessage;
  }

  async connect() {
    if (!this.innerChannel || this.innerChannel.isConnected()) {
      return;
    }

    await this.connectWithTimeout(this.innerChannel);
    this.updateIdentity(this.innerChannel);
  }

  async disconnect() {
    await this.disconnectCurrentChannel();
  }

  async configure(config: TConfig | null) {
    if (config === null) {
      this.config = null;
      await this.disconnectCurrentChannel();
      return;
    }

    if (!this.innerChannel || !Object.is(this.config, config)) {
      await this.disconnectCurrentChannel();
      this.config = config;
      this.innerChannel = await this.createChannel(config, this.channelOptions);
    }

    if (!this.innerChannel.isConnected()) {
      await this.connectWithTimeout(this.innerChannel);
    }

    this.updateIdentity(this.innerChannel);
  }

  getIdentity() {
    return this.identity;
  }

  isConnected() {
    return this.innerChannel?.isConnected() ?? false;
  }

  ownsJid(jid: string) {
    return this.ownsJidMatcher(jid);
  }

  reset() {
    this.clearState();
  }

  async sendMessage(jid: string, text: string) {
    if (!this.innerChannel || !this.innerChannel.isConnected()) {
      return;
    }

    await this.innerChannel.sendMessage(jid, text);
    await this.onOutboundMessage?.(jid, text);
  }

  async setTyping(jid: string, isTyping: boolean) {
    if (!this.innerChannel || typeof this.innerChannel.setTyping !== 'function') {
      return;
    }

    await this.innerChannel.setTyping(jid, isTyping);
  }

  private clearState() {
    this.config = null;
    this.identity = null;
    this.innerChannel = null;
  }

  private updateIdentity(channel: Channel | null) {
    this.identity = this.readIdentity(channel);
  }

  private async connectWithTimeout(channel: Channel) {
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    try {
      await Promise.race([
        Promise.resolve(channel.connect()),
        new Promise<never>((_, reject) => {
          timeoutHandle = globalThis.setTimeout(() => {
            reject(new Error(this.timeoutMessage));
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
        `Suppressing ${this.name} disconnect error after channel teardown because the logger worker already exited.`,
        error,
      );
    }

    if (this.innerChannel === currentChannel) {
      this.clearState();
    }
  }

  private async handleConnectFailure(channel: Channel) {
    try {
      await channel.disconnect();
    } catch (error) {
      console.warn(
        isWorkerExitedLoggerError(error)
          ? `Suppressing ${this.name} disconnect error after channel teardown because the logger worker already exited.`
          : `${this.name} cleanup after a failed connect also failed.`,
        error,
      );
    } finally {
      if (this.innerChannel === channel) {
        this.clearState();
      }
    }
  }
}
