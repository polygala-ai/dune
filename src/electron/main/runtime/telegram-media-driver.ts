// Telegram outbound media support for AgentLite's Grammy-backed channel.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ChannelDriver,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';

import { inferAttachmentKind } from '@/shared/agents/message-content';
import type { OutboundMessageAttachmentSource } from './dune-channel';

const TELEGRAM_CAPTION_LIMIT = 1024;

interface TelegramApi {
  sendDocument(chatId: string, document: unknown, options?: Record<string, unknown>): Promise<unknown>;
  sendPhoto(chatId: string, photo: unknown, options?: Record<string, unknown>): Promise<unknown>;
  sendVideo(chatId: string, video: unknown, options?: Record<string, unknown>): Promise<unknown>;
}

interface TelegramBackedDriver extends ChannelDriver {
  bot?: {
    api?: TelegramApi;
  } | null;
}

interface NormalizedOutboundAttachment {
  caption?: string;
  kind: 'document' | 'image' | 'video';
  name: string;
  source: string;
}

/** Returns source text from an outbound attachment. */
function attachmentSourceValue(attachment: OutboundMessageAttachmentSource) {
  if (typeof attachment === 'string') {
    return attachment.trim();
  }

  return (attachment.path ?? attachment.url ?? '').trim();
}

/** Normalizes file URL or path for Grammy upload/URL forwarding. */
function normalizeMediaSource(source: string) {
  if (!source) {
    return null;
  }

  if (source.startsWith('file://')) {
    return fileURLToPath(source);
  }

  if (source.startsWith('https://') || source.startsWith('http://')) {
    return source;
  }

  if (path.isAbsolute(source)) {
    return source;
  }

  return null;
}

/** Normalizes one attachment for Telegram's supported outbound media APIs. */
function normalizeAttachment(
  attachment: OutboundMessageAttachmentSource,
): NormalizedOutboundAttachment | null {
  const rawSource = attachmentSourceValue(attachment);
  const source = normalizeMediaSource(rawSource);

  if (!source) {
    return null;
  }

  const metadata = typeof attachment === 'string' ? {} : attachment;
  const name = metadata.name?.trim() || path.basename(source) || 'attachment';
  const inferredKind = inferAttachmentKind({
    name,
    url: source,
    ...(metadata.mimeType ? { mimeType: metadata.mimeType } : {}),
  });

  if (metadata.kind === 'image' || metadata.kind === 'video') {
    return {
      ...(metadata.caption ? { caption: metadata.caption } : {}),
      kind: metadata.kind,
      name,
      source,
    };
  }

  if (metadata.kind === 'document' || metadata.kind === 'file') {
    return {
      ...(metadata.caption ? { caption: metadata.caption } : {}),
      kind: 'document',
      name,
      source,
    };
  }

  if (inferredKind === 'audio') {
    return null;
  }

  return {
    ...(metadata.caption ? { caption: metadata.caption } : {}),
    kind: inferredKind === 'image' || inferredKind === 'video' ? inferredKind : 'document',
    name,
    source,
  };
}

/** Creates a Grammy media value from a URL or local file path. */
async function createTelegramMediaValue(source: string) {
  if (source.startsWith('https://') || source.startsWith('http://')) {
    return source;
  }

  const { InputFile } = await import('grammy');
  return new InputFile(source);
}

/** Builds Telegram media options. */
function createMediaOptions(text: string, attachment: NormalizedOutboundAttachment, includeText: boolean) {
  const caption = includeText
    ? text.trim() || attachment.caption?.trim() || ''
    : attachment.caption?.trim() || '';

  return caption
    ? { caption: caption.slice(0, TELEGRAM_CAPTION_LIMIT) }
    : undefined;
}

/** Sends one attachment through the matching Telegram Bot API method. */
async function sendTelegramAttachment(
  api: TelegramApi,
  chatId: string,
  attachment: NormalizedOutboundAttachment,
  text: string,
  includeText: boolean,
) {
  const media = await createTelegramMediaValue(attachment.source);
  const options = createMediaOptions(text, attachment, includeText);

  if (attachment.kind === 'image') {
    await api.sendPhoto(chatId, media, options);
    return;
  }

  if (attachment.kind === 'video') {
    await api.sendVideo(chatId, media, options);
    return;
  }

  await api.sendDocument(chatId, media, options);
}

/**
 * Wraps AgentLite's Telegram driver and adds outbound media support while
 * leaving connection, receive handling, and discovery behavior unchanged.
 */
export function withTelegramOutboundMedia(
  factory: ChannelDriverFactory,
): ChannelDriverFactory {
  return async (config) => {
    const driver = await factory(config) as TelegramBackedDriver;
    const wrappedDriver: ChannelDriver = {
      connect: () => driver.connect(),
      disconnect: () => driver.disconnect(),
      isConnected: () => driver.isConnected(),
      ownsJid: (jid: string) => driver.ownsJid(jid),
      sendMessage: async (
        jid: string,
        text: string,
        attachments?: OutboundMessageAttachmentSource[],
      ) => {
        const normalizedAttachments = Array.isArray(attachments)
          ? attachments.map(normalizeAttachment).filter((item): item is NormalizedOutboundAttachment => Boolean(item))
          : [];
        const api = driver.bot?.api;

        if (!api || normalizedAttachments.length === 0) {
          await driver.sendMessage(jid, text);
          return;
        }

        const chatId = jid.replace(/^tg:/, '');
        const canUseTextAsCaption = text.trim().length <= TELEGRAM_CAPTION_LIMIT;
        let sentAnyMedia = false;

        for (const [index, attachment] of normalizedAttachments.entries()) {
          if (
            !attachment.source.startsWith('http://') &&
            !attachment.source.startsWith('https://') &&
            !fs.existsSync(attachment.source)
          ) {
            continue;
          }

          await sendTelegramAttachment(
            api,
            chatId,
            attachment,
            text,
            index === 0 && canUseTextAsCaption,
          );
          sentAnyMedia = true;
        }

        if ((!sentAnyMedia || !canUseTextAsCaption) && text.trim()) {
          await driver.sendMessage(jid, text);
        }
      },
    };

    if (driver.setTyping) {
      wrappedDriver.setTyping = (jid, isTyping) => driver.setTyping?.(jid, isTyping) ?? Promise.resolve();
    }

    if (driver.syncGroups) {
      wrappedDriver.syncGroups = (force) => driver.syncGroups?.(force) ?? Promise.resolve();
    }

    return wrappedDriver;
  };
}
