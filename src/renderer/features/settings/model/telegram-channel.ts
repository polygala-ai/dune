// Telegram channel settings helpers.

/** Storage key for Telegram bot token secret. */
export const TELEGRAM_BOT_TOKEN_SECRET_KEY = 'channel:telegram:bot-token';

/** Telegram channel secrets store contract. */
export interface TelegramChannelSecretsStore {
  delete: (key: string) => Promise<void>;
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T) => Promise<void>;
}

/** Reads Telegram bot token. */
export async function readTelegramBotToken(
  secretsStore: TelegramChannelSecretsStore,
) {
  const value = await secretsStore.get<string>(TELEGRAM_BOT_TOKEN_SECRET_KEY);
  return typeof value === 'string' ? value : '';
}

/** Writes Telegram bot token. */
export async function writeTelegramBotToken(
  secretsStore: TelegramChannelSecretsStore,
  token: string,
) {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    await secretsStore.delete(TELEGRAM_BOT_TOKEN_SECRET_KEY);
    return;
  }

  await secretsStore.set(TELEGRAM_BOT_TOKEN_SECRET_KEY, trimmedToken);
}

/** Deletes Telegram bot token. */
export async function deleteTelegramBotToken(
  secretsStore: TelegramChannelSecretsStore,
) {
  await secretsStore.delete(TELEGRAM_BOT_TOKEN_SECRET_KEY);
}
