// Context panel host tests.

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextPanelHost } from '@/renderer/app/shell/ContextPanelHost';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import type { PresentedAgent } from '@/renderer/features/agents/types';

/** Creates agent. */
function createAgent(
  overrides: Partial<PresentedAgent> = {},
): PresentedAgent {
  return {
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    activityEvents: [],
    codingEngineEvents: [],
    contextCards: [],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    projectId: 'project-1',
    role: 'custom',
    status: 'ready',
    statusLabel: 'Ready',
    telegram: null,
    updatedAt: Date.now(),
    updatedLabel: 'Now',
    workspace: 'Prototype agent',
    ...overrides,
  };
}

/** Creates snapshot. */
function createSnapshot(
  overrides: Partial<AgentServiceSnapshot> = {},
): AgentServiceSnapshot {
  return {
    agents: [createAgent()],
    codingEngines: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      message: 'Ready',
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: 'agent-1',
    telegramSetupSessions: [],
    ...overrides,
  };
}

describe('ContextPanelHost', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState((state) => ({
      ...state,
      agents: [createAgent()],
      selectedAgentId: 'agent-1',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a centered customization modal in inline mode and saves to local store', async () => {
    const user = userEvent.setup();

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="inline"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Edit customization/i }));

    expect(
      await screen.findByRole('heading', { name: /Edit customization/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Additive instructions'), 'Stay concise.');
    await user.click(screen.getByRole('button', { name: /^Save draft$/i }));

    await waitFor(() => {
      expect(useAppStore.getState().agentCustomizations['agent-1']).toEqual(
        expect.objectContaining({
          additionalInstructions: 'Stay concise.',
        }),
      );
    });
  });

  it('reuses the drawer surface for customization editing in overlay mode', async () => {
    const user = userEvent.setup();

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="overlay"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Edit customization/i }));

    expect(
      await screen.findByRole('heading', { name: /Edit customization/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to inspector/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Back to inspector/i }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Edit customization/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('opens Telegram setup in a popup from the inspector', async () => {
    const user = userEvent.setup();

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="inline"
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Change channel'),
      'telegram',
    );

    expect(
      await screen.findByText(/Pair a Telegram chat here, then save the channel change from this popup/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Save Telegram channel/i }),
    ).toBeDisabled();
  });

  it('saves a paired Telegram channel from the popup even if the live setup session drops from the store', async () => {
    const user = userEvent.setup();
    const desktopBridge = window.duneDesktop!;
    const updateAgentChannel = vi
      .spyOn(agentRuntime.service, 'updateAgentChannel')
      .mockResolvedValue(undefined);

    desktopBridge.startTelegramSetupSession = vi.fn(async () => {
      useAppStore.getState().setAgentsSnapshot(createSnapshot({
        telegramSetupSessions: [
          {
            agentId: 'agent-1',
            botUsername: 'agentlite_test_bot',
            errorMessage: null,
            id: 'telegram-session-1',
            matchedChat: {
              channelId: 'telegram',
              jid: 'tg:123',
              kind: 'group',
              name: 'Product QA',
            },
            pairCode: 'PAIR42',
            pairExpiresAt: Date.now() + 10 * 60 * 1000,
            pairingStatus: 'matched',
            status: 'connected',
          },
        ],
      }));

      return 'telegram-session-1';
    });

    desktopBridge.getRuntimeSnapshot = vi.fn(async () => createSnapshot({
      telegramSetupSessions: useAppStore.getState().telegramSetupSessions,
    }));

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="inline"
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Change channel'),
      'telegram',
    );
    await user.click(screen.getByRole('button', { name: /I already have a token/i }));
    await user.type(screen.getByLabelText('Bot token'), '123456:test-token');
    await user.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Telegram channel/i }),
      ).toBeEnabled();
    });

    await act(async () => {
      useAppStore.getState().setAgentsSnapshot(createSnapshot());
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Telegram channel/i }),
      ).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /Save Telegram channel/i }));

    await waitFor(() => {
      expect(updateAgentChannel).toHaveBeenCalledWith({
        agentId: 'agent-1',
        channelId: 'telegram',
        telegramSetupSessionId: 'telegram-session-1',
      });
    });
  });

});
