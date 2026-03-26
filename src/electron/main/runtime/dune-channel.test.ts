import { describe, expect, it, vi } from 'vitest';

import { DuneChannel } from './dune-channel';

describe('DuneChannel', () => {
  it('persists outbound assistant messages before fanning them out to Dune', async () => {
    const onOutboundMessage = vi.fn().mockResolvedValue(undefined);
    const onChatMetadata = vi.fn();
    const onMessage = vi.fn();
    const duneChannel = new DuneChannel({ onOutboundMessage });

    duneChannel._setOpts({
      onChatMetadata,
      onMessage,
      registeredGroups: () => ({
        'dune:agent:test': {
          name: 'Release coordinator',
        },
      }),
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
        id: 'dune-bot-1',
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
