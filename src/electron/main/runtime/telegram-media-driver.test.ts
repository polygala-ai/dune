// Telegram media driver tests.

import type {
  ChannelDriver,
  ChannelDriverConfig,
  ChannelDriverFactory,
} from '@boxlite-ai/agentlite';
import { describe, expect, it, vi } from 'vitest';

import { withTelegramOutboundMedia } from './telegram-media-driver';

/** Creates a wrapped Telegram driver test harness. */
async function createHarness() {
  const api = {
    sendDocument: vi.fn(() => Promise.resolve({})),
    sendPhoto: vi.fn(() => Promise.resolve({})),
    sendVideo: vi.fn(() => Promise.resolve({})),
  };
  const textSendMessage = vi.fn(() => Promise.resolve());
  const baseDriver = {
    bot: { api },
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(() => Promise.resolve()),
    isConnected: vi.fn(() => true),
    ownsJid: (jid: string) => jid.startsWith('tg:'),
    sendMessage: textSendMessage,
  } as unknown as ChannelDriver;
  const factory = vi.fn(() => Promise.resolve(baseDriver)) as ChannelDriverFactory;
  const wrappedFactory = withTelegramOutboundMedia(factory);
  const driver = await wrappedFactory({
    onChatMetadata: vi.fn(),
    onMessage: vi.fn(),
    registeredGroups: () => ({}),
  } satisfies ChannelDriverConfig);

  return {
    api,
    driver,
    textSendMessage,
  };
}

describe('withTelegramOutboundMedia', () => {
  it('sends image attachments with bot.api.sendPhoto', async () => {
    const { api, driver, textSendMessage } = await createHarness();

    await (driver.sendMessage as unknown as (
      jid: string,
      text: string,
      attachments: unknown[],
    ) => Promise<void>)('tg:123', 'chart attached', [
      {
        kind: 'image',
        name: 'chart.png',
        url: 'https://example.test/chart.png',
      },
    ]);

    expect(api.sendPhoto).toHaveBeenCalledWith(
      '123',
      'https://example.test/chart.png',
      { caption: 'chart attached' },
    );
    expect(api.sendDocument).not.toHaveBeenCalled();
    expect(api.sendVideo).not.toHaveBeenCalled();
    expect(textSendMessage).not.toHaveBeenCalled();
  });

  it('sends document attachments with bot.api.sendDocument', async () => {
    const { api, driver, textSendMessage } = await createHarness();

    await (driver.sendMessage as unknown as (
      jid: string,
      text: string,
      attachments: unknown[],
    ) => Promise<void>)('tg:123', 'report attached', [
      {
        kind: 'document',
        name: 'report.pdf',
        url: 'https://example.test/report.pdf',
      },
    ]);

    expect(api.sendDocument).toHaveBeenCalledWith(
      '123',
      'https://example.test/report.pdf',
      { caption: 'report attached' },
    );
    expect(api.sendPhoto).not.toHaveBeenCalled();
    expect(api.sendVideo).not.toHaveBeenCalled();
    expect(textSendMessage).not.toHaveBeenCalled();
  });

  it('sends media attachments when there is no text content', async () => {
    const { api, driver, textSendMessage } = await createHarness();

    await (driver.sendMessage as unknown as (
      jid: string,
      text: string,
      attachments: unknown[],
    ) => Promise<void>)('tg:123', '', [
      {
        kind: 'image',
        name: 'chart.png',
        url: 'https://example.test/chart.png',
      },
    ]);

    expect(api.sendPhoto).toHaveBeenCalledWith(
      '123',
      'https://example.test/chart.png',
      undefined,
    );
    expect(textSendMessage).not.toHaveBeenCalled();
  });

  it('sends video attachments with bot.api.sendVideo', async () => {
    const { api, driver, textSendMessage } = await createHarness();

    await (driver.sendMessage as unknown as (
      jid: string,
      text: string,
      attachments: unknown[],
    ) => Promise<void>)('tg:123', 'demo attached', [
      {
        kind: 'video',
        name: 'demo.mp4',
        url: 'https://example.test/demo.mp4',
      },
    ]);

    expect(api.sendVideo).toHaveBeenCalledWith(
      '123',
      'https://example.test/demo.mp4',
      { caption: 'demo attached' },
    );
    expect(api.sendDocument).not.toHaveBeenCalled();
    expect(api.sendPhoto).not.toHaveBeenCalled();
    expect(textSendMessage).not.toHaveBeenCalled();
  });
});
