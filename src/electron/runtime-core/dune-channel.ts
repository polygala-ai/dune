import type {
  DuneChannelCallbacks,
  RegisteredGroup,
} from './agentlite-host-core';

interface DuneChannelOptions {
  onOutboundMessage: (jid: string, text: string) => Promise<void> | void;
}

export class DuneChannel {
  name = 'dune';

  private connected = false;

  private inboundSequence = 0;

  private outboundSequence = 0;

  private readonly onOutboundMessage: DuneChannelOptions['onOutboundMessage'];

  private callbacks: DuneChannelCallbacks = {
    onChatMetadata: () => {},
    onMessage: () => {},
    registeredGroups: () => ({} satisfies Record<string, RegisteredGroup>),
  };

  constructor({ onOutboundMessage }: DuneChannelOptions) {
    this.onOutboundMessage = onOutboundMessage;
  }

  _setOpts(callbacks: DuneChannelCallbacks) {
    this.callbacks = callbacks;
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
    const group = this.callbacks.registeredGroups()[jid];

    this.callbacks.onChatMetadata(
      jid,
      timestamp,
      group?.name ?? jid,
      this.name,
      true,
    );

    this.callbacks.onMessage(jid, {
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
    const group = this.callbacks.registeredGroups()[jid];

    this.callbacks.onChatMetadata(
      jid,
      timestamp,
      group?.name ?? jid,
      this.name,
      true,
    );

    this.callbacks.onMessage(jid, {
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
