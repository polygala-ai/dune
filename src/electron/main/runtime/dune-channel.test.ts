// Dune channel tests.

import { describe, expect, it, vi } from 'vitest';

import { DuneChannel } from './dune-channel';

describe('DuneChannel', () => {
  it('persists outbound assistant messages before fanning them out to Dune', async () => {
    const onOutboundMessage = vi.fn().mockResolvedValue(undefined);
    const onChatMetadata = vi.fn();
    const onMessage = vi.fn();
    const duneChannel = new DuneChannel({
      config: {
        onChatMetadata,
        onMessage,
        registeredGroups: () => ({
          'dune:agent:test': {
            added_at: new Date('2026-04-04T00:00:00.000Z').toISOString(),
            folder: 'release-coordinator',
            name: 'Release coordinator',
            trigger: '@Dune',
          },
        }),
      },
      onOutboundMessage,
      primaryJid: 'dune:agent:test',
    });

    await duneChannel.sendMessage('dune:agent:test', 'dune credentials ok');

    expect(onChatMetadata).toHaveBeenCalledWith(
      'dune:agent:test',
      expect.any(String),
      'Release coordinator',
      'dune',
      true,
    );
    expect(onMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      expect.objectContaining({
        chat_jid: 'dune:agent:test',
        content: 'dune credentials ok',
        is_bot_message: true,
        is_from_me: true,
        sender: 'dune-assistant',
        sender_name: 'Dune',
        timestamp: expect.any(String),
      }),
    );
    expect(onOutboundMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      'dune credentials ok',
    );
  });

  it('decorates outbound assistant messages only for external fan-out', async () => {
    const externalDriver = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      ownsJid: vi.fn().mockReturnValue(true),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    const onOutboundMessage = vi.fn().mockResolvedValue(undefined);
    const onChatMetadata = vi.fn();
    const onMessage = vi.fn();
    const duneChannel = new DuneChannel({
      config: {
        onChatMetadata,
        onMessage,
        registeredGroups: () => ({
          'dune:agent:test': {
            added_at: new Date('2026-04-04T00:00:00.000Z').toISOString(),
            folder: 'release-coordinator',
            name: 'Release coordinator',
            trigger: '@Dune',
          },
        }),
      },
      externalChannelFactory: async () => externalDriver,
      decorateOutboundMessage: (chatJid, text) => `${text}\n\n📊 ${chatJid}`,
      onOutboundMessage,
      boundExternalJid: 'tg:123',
      primaryJid: 'dune:agent:test',
    });

    await duneChannel.connect();
    await duneChannel.sendMessage('dune:agent:test', 'dune credentials ok');

    expect(onMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      expect.objectContaining({
        content: 'dune credentials ok',
      }),
    );
    expect(onOutboundMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      'dune credentials ok',
    );
    expect(externalDriver.sendMessage).toHaveBeenCalledWith(
      'tg:123',
      'dune credentials ok\n\n📊 dune:agent:test',
    );
  });
});
