// Telegram notification delivery.

import type { TelegramBridge } from '@/electron/main/runtime/telegram-bridge';

interface TelegramNotificationBridge {
  sendNotificationMessage?: (chatId: string, text: string) => Promise<void>;
}

export async function sendTelegramNotification(
  telegramBridge: TelegramBridge | null | undefined,
  chatId: string,
  title: string,
  body: string,
): Promise<boolean> {
  const trimmedChatId = chatId.trim();

  if (!telegramBridge || !trimmedChatId) {
    return false;
  }

  const bridge = telegramBridge as unknown as TelegramNotificationBridge;

  if (typeof bridge.sendNotificationMessage !== 'function') {
    // TODO: TelegramBridge currently manages setup and agent channel bindings,
    // but it does not expose a generic outbound host notification API yet.
    return false;
  }

  await bridge.sendNotificationMessage(trimmedChatId, `${title}\n${body}`.trim());
  return true;
}
