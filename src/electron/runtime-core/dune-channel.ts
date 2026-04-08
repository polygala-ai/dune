import type { ChannelDriver, ChannelDriverConfig } from '@boxlite-ai/agentlite';

interface DuneChannelOptions {
  config: ChannelDriverConfig;
  onOutboundMessage: (jid: string, text: string) => Promise<void> | void;
}

export class DuneChannel implements ChannelDriver {
  private connected = false;

  private readonly config: ChannelDriverConfig;

  private readonly onOutboundMessage: DuneChannelOptions['onOutboundMessage'];

  constructor({ config, onOutboundMessage }: DuneChannelOptions) {
    this.config = config;
    this.onOutboundMessage = onOutboundMessage;
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  ownsJid(jid: string) {
    return jid.startsWith('dune:agent:');
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
