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

  it('decorates outbound assistant messages before persistence and fan-out', async () => {
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
      decorateOutboundMessage: (chatJid, text) => `${text}\n\n📊 ${chatJid}`,
      onOutboundMessage,
      primaryJid: 'dune:agent:test',
    });

    await duneChannel.sendMessage('dune:agent:test', 'dune credentials ok');

    expect(onMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      expect.objectContaining({
        content: 'dune credentials ok\n\n📊 dune:agent:test',
      }),
    );
    expect(onOutboundMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      'dune credentials ok\n\n📊 dune:agent:test',
    );
  });

  it('forwards outbound attachments to the external channel and local callbacks', async () => {
    const onOutboundMessage = vi.fn().mockResolvedValue(undefined);
    const onChatMetadata = vi.fn();
    const onMessage = vi.fn();
    const externalSendMessage = vi.fn().mockResolvedValue(undefined);
    const duneChannel = new DuneChannel({
      boundExternalJid: 'tg:123',
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
      externalChannelFactory: () => ({
        connect: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve()),
        isConnected: vi.fn(() => true),
        ownsJid: (jid: string) => jid.startsWith('tg:'),
        sendMessage: externalSendMessage,
      }),
      onOutboundMessage,
      primaryJid: 'dune:agent:test',
    });
    const attachments = [
      {
        kind: 'image' as const,
        name: 'chart.png',
        url: 'file:///tmp/chart.png',
      },
    ];

    await duneChannel.connect();
    await duneChannel.sendMessage('dune:agent:test', 'chart attached', attachments);

    expect(onMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      expect.objectContaining({
        attachments,
        content: 'chart attached',
      }),
    );
    expect(externalSendMessage).toHaveBeenCalledWith(
      'tg:123',
      'chart attached',
      attachments,
    );
    expect(onOutboundMessage).toHaveBeenCalledWith(
      'dune:agent:test',
      'chart attached',
      attachments,
    );
  });
});
