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
});
