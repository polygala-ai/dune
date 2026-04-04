import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import type {
  Agent,
  CreateAgentInput,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';

describe('CreateAgentDialog', () => {
  const projects = [
    {
      color: '#A86D46',
      createdAt: 1,
      description: 'Project workspace',
      id: 'project-1',
      name: 'Research Platform',
      updatedAt: 1,
    },
  ];

  function renderDialog(options: {
    existingAgents?: Agent[];
    externalChannels?: ExternalChannelsState;
    onCreateAgent?: (input: CreateAgentInput) => Promise<void>;
    onOpenChannelsSettings?: () => void;
  } = {}) {
    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        existingAgents={options.existingAgents ?? []}
        externalChannels={options.externalChannels ?? createDefaultExternalChannelsState()}
        onCreateAgent={options.onCreateAgent ?? vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={options.onOpenChannelsSettings ?? vi.fn()}
        open
        projects={projects}
      />,
    );
  }

  it('shows a compact channel trigger and renders disabled external channels in the popover', async () => {
    const user = userEvent.setup();

    renderDialog();

    const trigger = screen.getByRole('button', { name: /Channel: Dune chat/i });

    expect(trigger).toBeInTheDocument();
    expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();

    await user.click(trigger);

    const popover = await screen.findByTestId('channel-select-popover');

    expect(within(popover).getByRole('button', { name: /Select Dune chat/i })).toBeEnabled();
    expect(within(popover).getByRole('button', { name: /Select Telegram/i })).toBeDisabled();
    expect(within(popover).getByRole('button', { name: /Select Slack/i })).toBeDisabled();
    expect(within(popover).getByRole('button', { name: /Select Discord/i })).toBeDisabled();
  });

  it('preserves the default channel and submits structured agent input', async () => {
    const user = userEvent.setup();
    const onCreateAgent = vi.fn().mockResolvedValue(undefined);

    renderDialog({ onCreateAgent });

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(
      within(await screen.findByTestId('channel-select-popover')).getByRole('button', {
        name: /Select Dune chat/i,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Agent name'), 'Navigator');
    await user.click(screen.getByRole('button', { name: /^Create agent$/i }));

    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalledWith({
        channelId: 'dune-chat',
        name: 'Navigator',
        projectId: 'project-1',
      });
    });
  });

  it('routes to channels settings from the popover shortcut', async () => {
    const user = userEvent.setup();
    const onOpenChannelsSettings = vi.fn();

    renderDialog({ onOpenChannelsSettings });

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(screen.getByRole('button', { name: /Open Channels settings/i }));

    expect(onOpenChannelsSettings).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();
    });
  });

  it('uses the centered shared dialog surface motion', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Name the agent' });

    expect(dialog).toHaveClass(
      'dialog-surface-motion',
      'left-1/2',
      'top-1/2',
      '-translate-x-1/2',
      '-translate-y-1/2',
    );
    expect(dialog).not.toHaveClass('shell-reveal');
  });

  it('enables Telegram selection when configured and submits the discovered chat target', async () => {
    const user = userEvent.setup();
    const onCreateAgent = vi.fn().mockResolvedValue(undefined);
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [
          {
            channelId: 'telegram',
            jid: 'tg:123',
            kind: 'group',
            lastSeenAt: 1,
            name: 'Product QA',
          },
        ],
        errorMessage: null,
        status: 'connected',
      },
    };

    renderDialog({
      externalChannels,
      onCreateAgent,
    });

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(await screen.findByRole('button', { name: /Select Telegram/i }));

    expect(screen.getByTestId('telegram-chat-select')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('telegram-chat-select'), 'tg:123');
    await user.type(screen.getByLabelText('Agent name'), 'Release triage');
    await user.click(screen.getByRole('button', { name: /^Create agent$/i }));

    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalledWith({
        channelId: 'telegram',
        externalTarget: {
          channelId: 'telegram',
          jid: 'tg:123',
          kind: 'group',
          name: 'Product QA',
        },
        name: 'Release triage',
        projectId: 'project-1',
      });
    });
  });

  it('shows actionable Telegram empty-state guidance and opens the connected bot', async () => {
    const user = userEvent.setup();
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [],
        errorMessage: null,
        status: 'connected',
      },
    };

    renderDialog({ externalChannels });

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(await screen.findByRole('button', { name: /Select Telegram/i }));

    expect(
      screen.getByText(
        'DM @agentlite_test_bot once, or add it to a group and mention it once there. This list updates automatically when the bot receives the message.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Open bot$/i }));

    expect(window.duneDesktop?.openExternal).toHaveBeenCalledWith('https://t.me/agentlite_test_bot');
    expect(screen.getByRole('button', { name: /Open Channels settings/i })).toBeInTheDocument();
  });
});
