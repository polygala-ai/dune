// Telegram notification wrapper.

import type { TelegramBridge } from '@/electron/main/runtime/telegram-bridge';

export interface TelegramNotificationPayload {
  title: string;
  body: string;
  chatId: string;
}

/** Normalizes a Telegram notification chat id to AgentLite's jid shape. */
export function normalizeNotificationChatId(chatId: string) {
  const trimmedChatId = chatId.trim();

  if (!trimmedChatId) {
    return '';
  }

  return trimmedChatId.startsWith('tg:') ? trimmedChatId : `tg:${trimmedChatId}`;
}

/** Sends notification messages through the existing Telegram bridge. */
export class TelegramNotifier {
  constructor(
    private readonly getTelegramBridge: () => TelegramBridge | null = () => null,
  ) {}

  /** Sends a Telegram notification when a bridge and chat id are available. */
  async send(payload: TelegramNotificationPayload): Promise<boolean> {
    const telegramBridge = this.getTelegramBridge();
    const normalizedChatId = normalizeNotificationChatId(payload.chatId);
    const lines = [payload.title.trim(), payload.body.trim()].filter(Boolean);

    if (!telegramBridge || !normalizedChatId || lines.length === 0) {
      return false;
    }

    return telegramBridge.sendSystemMessage(normalizedChatId, lines.join('\n'));
  }
}
