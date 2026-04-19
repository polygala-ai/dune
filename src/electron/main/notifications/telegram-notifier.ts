// Telegram notification delivery.

import type { TelegramBridge } from '@/electron/main/runtime/telegram-bridge';

/** Delivery payload shape. */
export interface TelegramNotificationPayload {
  body: string;
  chatId: string;
  title: string;
}

/** Telegram notification wrapper. */
export class TelegramNotifier {
  private readonly getBridge: () => TelegramBridge | null;

  constructor(getBridge: () => TelegramBridge | null) {
    this.getBridge = getBridge;
  }

  /** Sends a Telegram message when the bridge is configured. */
  async send(payload: TelegramNotificationPayload) {
    const chatId = payload.chatId.trim();
    const bridge = this.getBridge();

    if (!bridge || !chatId) {
      return false;
    }

    return bridge.sendNotificationMessage(
      chatId,
      `${payload.title}\n${payload.body}`.trim(),
    );
  }
}
