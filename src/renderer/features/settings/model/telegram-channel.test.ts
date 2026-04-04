import { describe, expect, it, vi } from 'vitest';

import {
  deleteTelegramBotToken,
  readTelegramBotToken,
  TELEGRAM_BOT_TOKEN_SECRET_KEY,
  type TelegramChannelSecretsStore,
  writeTelegramBotToken,
} from '@/renderer/features/settings/model/telegram-channel';

function createSecretsStore(initialValue: string | null = null) {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set(TELEGRAM_BOT_TOKEN_SECRET_KEY, initialValue);
  }

  const get: TelegramChannelSecretsStore['get'] = async <T,>(key: string) =>
    (values.get(key) as T | undefined) ?? null;

  const store: TelegramChannelSecretsStore & { values: Map<string, string> } = {
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    get,
    set: vi.fn(async <T,>(key: string, value: T) => {
      values.set(key, String(value));
    }),
    values,
  };

  return store;
}

describe('telegram channel settings model', () => {
  it('reads the saved Telegram token from secure storage', async () => {
    const store = createSecretsStore('bot-token-123');

    await expect(readTelegramBotToken(store)).resolves.toBe('bot-token-123');
  });

  it('trims and writes the Telegram token into secure storage', async () => {
    const store = createSecretsStore();

    await writeTelegramBotToken(store, '  bot-token-123  ');

    expect(store.set).toHaveBeenCalledWith(
      TELEGRAM_BOT_TOKEN_SECRET_KEY,
      'bot-token-123',
    );
    expect(store.values.get(TELEGRAM_BOT_TOKEN_SECRET_KEY)).toBe('bot-token-123');
  });

  it('deletes the saved Telegram token when the value is cleared', async () => {
    const store = createSecretsStore('bot-token-123');

    await writeTelegramBotToken(store, '   ');
    await deleteTelegramBotToken(store);

    expect(store.delete).toHaveBeenCalledWith(TELEGRAM_BOT_TOKEN_SECRET_KEY);
    expect(store.values.has(TELEGRAM_BOT_TOKEN_SECRET_KEY)).toBe(false);
  });
});
