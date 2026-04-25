// Dune external-channel integration.

import type {
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import { isDuneAgentChatJid } from '@/shared/agents/agent-id';

/** Attachment metadata that can be forwarded to external channel drivers. */
export interface OutboundMessageAttachment {
  caption?: string;
  kind?: 'audio' | 'document' | 'file' | 'image' | 'video';
  mimeType?: string;
  name?: string;
  path?: string;
  url?: string;
}

export type OutboundMessageAttachmentSource = OutboundMessageAttachment | string;

interface AttachmentAwareChannelDriver extends ChannelDriver {
  sendMessage(
    jid: string,
    text: string,
    attachments?: OutboundMessageAttachmentSource[],
  ): Promise<void>;
}

/** Dune channel options. */
export interface DuneChannelOptions {
  boundExternalJid?: string | undefined;
  config: ChannelDriverConfig;
  decorateOutboundMessage?: ((chatJid: string, text: string) => Promise<string> | string) | undefined;
  externalChannelFactory?: ChannelDriverFactory | undefined;
  onExternalInbound?: ((text: string, senderName: string, attachments?: string[]) => Promise<void> | void) | undefined;
  onOutboundMessage: (
    chatJid: string,
    text: string,
    attachments?: OutboundMessageAttachmentSource[],
  ) => Promise<void> | void;
  primaryJid: string;
}

/** Normalizes outbound attachments. */
function normalizeOutboundAttachments(
  attachments: unknown,
): OutboundMessageAttachmentSource[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.filter((attachment): attachment is OutboundMessageAttachmentSource => {
    if (typeof attachment === 'string') {
      return attachment.trim().length > 0;
    }

    return Boolean(attachment && typeof attachment === 'object');
  });
}

/** Implements Dune channel behavior. */
export class DuneChannel implements ChannelDriver {
  private connected = false;

  private readonly config: ChannelDriverConfig;

  private readonly decorateOutboundMessage: DuneChannelOptions['decorateOutboundMessage'];

  private externalDriver: ChannelDriver | null = null;

  private readonly externalChannelFactory: ChannelDriverFactory | undefined;

  private boundExternalJid: string | undefined;

  private readonly onExternalInbound: DuneChannelOptions['onExternalInbound'];

  private readonly onOutboundMessage: DuneChannelOptions['onOutboundMessage'];

  private readonly primaryJid: string;

  constructor(options: DuneChannelOptions) {
    this.config = options.config;
    this.decorateOutboundMessage = options.decorateOutboundMessage;
    this.onExternalInbound = options.onExternalInbound;
    this.onOutboundMessage = options.onOutboundMessage;
    this.primaryJid = options.primaryJid;
    this.externalChannelFactory = options.externalChannelFactory;
    this.boundExternalJid = options.boundExternalJid;
  }

  /** Connects Dune. */
  async connect() {
    if (this.externalChannelFactory && !this.externalDriver) {
      this.externalDriver = await this.createWrappedDriver(this.externalChannelFactory);
    }

    if (this.externalDriver) {
      await this.externalDriver.connect();
    }

    this.connected = true;
  }

  /** Attach an external channel at runtime (hot-plug). */
  async attachExternalChannel(factory: ChannelDriverFactory, boundJid: string) {
    // Disconnect existing external driver if any
    if (this.externalDriver) {
      await this.externalDriver.disconnect();
    }

    this.externalDriver = await this.createWrappedDriver(factory);
    this.boundExternalJid = boundJid;
    await this.externalDriver.connect();
  }

  /** Detaches external channel. */
  async detachExternalChannel() {
    if (this.externalDriver) {
      await this.externalDriver.disconnect();
    }

    this.externalDriver = null;
    this.boundExternalJid = undefined;
  }

  private async createWrappedDriver(factory: ChannelDriverFactory): Promise<ChannelDriver> {
    const wrappedConfig: ChannelDriverConfig = {
      onChatMetadata: (_chatJid, timestamp, name, channel, isGroup) => {
        this.config.onChatMetadata(this.primaryJid, timestamp, name, channel, isGroup);
      },
      onMessage: (_chatJid, msg) => {
        // Record inbound external messages in the snapshot so they appear in the UI.
        if (!msg.is_from_me && !msg.is_bot_message && this.onExternalInbound) {
          const senderName = msg.sender_name?.trim() || msg.sender?.trim() || 'External';
          const attachments = Array.isArray(msg.attachments) ? (msg.attachments as string[]) : [];
          void this.onExternalInbound(msg.content, senderName, attachments);
        }

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
    return factory(wrappedConfig);
  }

  /** Disconnects Dune. */
  async disconnect() {
    await this.detachExternalChannel();

    this.connected = false;
  }

  /** Returns whether connected. */
  isConnected() {
    return this.connected;
  }

  /** Ownses jid. */
  ownsJid(jid: string) {
    return isDuneAgentChatJid(jid);
  }

  /** Sends message. */
  async sendMessage(
    jid: string,
    text: string,
    attachments?: OutboundMessageAttachmentSource[],
  ) {
    const outboundText = this.decorateOutboundMessage
      ? await this.decorateOutboundMessage(jid, text)
      : text;
    const outboundAttachments = normalizeOutboundAttachments(attachments);
    const timestamp = new Date().toISOString();
    const group = this.config.registeredGroups()[jid];

    this.config.onChatMetadata(
      jid,
      timestamp,
      (group as Record<string, unknown> | undefined)?.name as string ?? jid,
      'dune',
      true,
    );

    const outboundMessage = {
      chat_jid: jid,
      content: outboundText,
      is_bot_message: true,
      is_from_me: true,
      sender: 'dune-assistant',
      sender_name: 'Dune',
      timestamp,
      ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
    } as Parameters<ChannelDriverConfig['onMessage']>[1] & {
      attachments?: OutboundMessageAttachmentSource[];
    };

    this.config.onMessage(jid, outboundMessage as Parameters<ChannelDriverConfig['onMessage']>[1]);

    if (this.externalDriver && this.boundExternalJid) {
      if (outboundAttachments.length > 0) {
        await (this.externalDriver as AttachmentAwareChannelDriver).sendMessage(
          this.boundExternalJid,
          outboundText,
          outboundAttachments,
        );
      } else {
        await this.externalDriver.sendMessage(this.boundExternalJid, outboundText);
      }
    }

    if (outboundAttachments.length > 0) {
      await this.onOutboundMessage(jid, outboundText, outboundAttachments);
    } else {
      await this.onOutboundMessage(jid, outboundText);
    }
  }

  /** Pushes inbound message. */
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
