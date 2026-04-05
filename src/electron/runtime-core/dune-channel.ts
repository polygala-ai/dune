import type { Channel, ChannelOpts } from '@boxlite-ai/agentlite';

interface DuneChannelOptions {
  channelOptions: ChannelOpts;
  onOutboundMessage: (jid: string, text: string) => Promise<void> | void;
}

export class DuneChannel implements Channel {
  name = 'dune';

  private connected = false;

  private inboundSequence = 0;

  private outboundSequence = 0;

  private readonly channelOptions: ChannelOpts;

  private readonly onOutboundMessage: DuneChannelOptions['onOutboundMessage'];

  constructor({ channelOptions, onOutboundMessage }: DuneChannelOptions) {
    this.channelOptions = channelOptions;
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
    return jid === 'dune:main' || jid.startsWith('dune:agent:');
  }

  async sendMessage(jid: string, text: string) {
    const timestamp = new Date().toISOString();
    const group = this.channelOptions.registeredGroups()[jid];

    this.channelOptions.onChatMetadata(
      jid,
      timestamp,
      group?.name ?? jid,
      this.name,
      true,
    );

    this.channelOptions.onMessage(jid, {
      chat_jid: jid,
      content: text,
      id: `dune-bot-${++this.outboundSequence}`,
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
    const group = this.channelOptions.registeredGroups()[jid];

    this.channelOptions.onChatMetadata(
      jid,
      timestamp,
      group?.name ?? jid,
      this.name,
      true,
    );

    this.channelOptions.onMessage(jid, {
      content: text,
      chat_jid: jid,
      id: `dune-${++this.inboundSequence}`,
      is_from_me: false,
      sender: 'dune-user',
      sender_name: senderName,
      timestamp,
    });
  }
}
