import type {
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import { isDuneAgentChatJid } from '@/shared/agents/agent-id';

export interface DuneChannelOptions {
  boundExternalJid?: string | undefined;
  config: ChannelDriverConfig;
  externalChannelFactory?: ChannelDriverFactory | undefined;
  onOutboundMessage: (chatJid: string, text: string) => Promise<void> | void;
  primaryJid: string;
}

export class DuneChannel implements ChannelDriver {
  private connected = false;

  private readonly config: ChannelDriverConfig;

  private externalDriver: ChannelDriver | null = null;

  private readonly externalChannelFactory: ChannelDriverFactory | undefined;

  private readonly boundExternalJid: string | undefined;

  private readonly onOutboundMessage: DuneChannelOptions['onOutboundMessage'];

  private readonly primaryJid: string;

  constructor(options: DuneChannelOptions) {
    this.config = options.config;
    this.onOutboundMessage = options.onOutboundMessage;
    this.primaryJid = options.primaryJid;
    this.externalChannelFactory = options.externalChannelFactory;
    this.boundExternalJid = options.boundExternalJid;
  }

  async connect() {
    if (this.externalChannelFactory && !this.externalDriver) {
      const wrappedConfig: ChannelDriverConfig = {
        onChatMetadata: (_chatJid, timestamp, name, channel, isGroup) => {
          this.config.onChatMetadata(this.primaryJid, timestamp, name, channel, isGroup);
        },
        onMessage: (_chatJid, msg) => {
          this.config.onMessage(this.primaryJid, {
            ...msg,
            chat_jid: this.primaryJid,
          });
        },
        registeredGroups: () => {
          const groups = this.config.registeredGroups();
          return new Proxy(groups, {
            get: (target, prop) => {
              if (typeof prop === 'string' && !isDuneAgentChatJid(prop)) {
                return target[this.primaryJid] ?? { name: 'External' };
              }
              return target[prop as string];
            },
          });
        },
      };
      this.externalDriver = await this.externalChannelFactory(wrappedConfig);
    }

    if (this.externalDriver) {
      await this.externalDriver.connect();
    }

    this.connected = true;
  }

  async disconnect() {
    if (this.externalDriver) {
      await this.externalDriver.disconnect();
    }

    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  ownsJid(jid: string) {
    return isDuneAgentChatJid(jid);
  }

  async sendMessage(jid: string, text: string) {
    const timestamp = new Date().toISOString();
    const group = this.config.registeredGroups()[jid];

    this.config.onChatMetadata(
      jid,
      timestamp,
      (group as Record<string, unknown> | undefined)?.name as string ?? jid,
      'dune',
      true,
    );

    this.config.onMessage(jid, {
      chat_jid: jid,
      content: text,
      is_bot_message: true,
      is_from_me: true,
      sender: 'dune-assistant',
      sender_name: 'Dune',
      timestamp,
    });

    if (this.externalDriver && this.boundExternalJid) {
      await this.externalDriver.sendMessage(this.boundExternalJid, text);
    }

    await this.onOutboundMessage(jid, text);
  }

  async pushInboundMessage(jid: string, text: string, senderName: string = 'You') {
    const timestamp = new Date().toISOString();
    const group = this.config.registeredGroups()[jid];

    this.config.onChatMetadata(
      jid,
      timestamp,
      (group as Record<string, unknown> | undefined)?.name as string ?? jid,
      'dune',
      true,
    );

    this.config.onMessage(jid, {
      chat_jid: jid,
      content: text,
      is_from_me: false,
      sender: 'dune-user',
      sender_name: senderName,
      timestamp,
    });
  }
}
