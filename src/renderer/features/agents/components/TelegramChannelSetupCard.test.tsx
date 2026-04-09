import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import { TelegramChannelSetupCard } from '@/renderer/features/agents/components/TelegramChannelSetupCard';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import type { TelegramSetupSession } from '@/renderer/features/agents/types';
import { useAppStore } from '@/renderer/app/store/use-app-store';

function createSnapshot(
  overrides: Partial<AgentServiceSnapshot> = {},
): AgentServiceSnapshot {
  return {
    agents: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      message: 'Ready',
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
    ...overrides,
  };
}

describe('TelegramChannelSetupCard', () => {
  const resetStore = () => {
    useAppStore.getState().setAgentsSnapshot(createSnapshot());
  };

  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('runs the create flow from BotFather to pair code without the old chat picker surfaces', async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn(async () => undefined);
    const startTelegramSetupSession = vi.fn(async () => {
      const session: TelegramSetupSession = {
        agentId: null,
        botUsername: 'agentlite_test_bot',
        errorMessage: null,
        id: 'telegram-session-1',
        matchedChat: null,
        pairCode: 'PAIR42',
        pairExpiresAt: Date.now() + 10 * 60 * 1000,
        pairingStatus: 'listening',
        status: 'connected',
      };

      await act(async () => {
        useAppStore.getState().setAgentsSnapshot(createSnapshot({
          telegramSetupSessions: [session],
        }));
      });

      return session.id;
    });

    window.duneDesktop = {
      ...window.duneDesktop,
      getRuntimeSnapshot: vi.fn(async () => createSnapshot({
        telegramSetupSessions: useAppStore.getState().telegramSetupSessions,
      })),
      openExternal,
      platform: 'darwin',
      startTelegramSetupSession,
    };

    render(<TelegramChannelSetupCard />);

    expect(await screen.findByTestId('telegram-wizard-step-botfather')).toBeInTheDocument();
    expect(screen.queryByText('Telegram chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Discovered chats')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open BotFather/i }));
    expect(openExternal).toHaveBeenCalledWith('https://t.me/BotFather');

    await user.click(screen.getByRole('button', { name: /I already have a token/i }));
    await user.type(screen.getByLabelText('Bot token'), '123456:test-token');
    await user.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() => {
      expect(screen.getByTestId('telegram-wizard-step-pairing')).toBeInTheDocument();
    });
    expect(startTelegramSetupSession).toHaveBeenCalledWith({ token: '123456:test-token' });
    expect(screen.getByText('/pair PAIR42')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open bot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy bot/i })).not.toBeInTheDocument();
  });

});
