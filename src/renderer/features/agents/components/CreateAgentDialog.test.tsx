import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';

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

  it('shows a compact channel trigger and renders disabled external channels in the popover', async () => {
    const user = userEvent.setup();

    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        onCreateAgent={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={vi.fn()}
        open
        projects={projects}
      />,
    );

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

    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        onCreateAgent={onCreateAgent}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={vi.fn()}
        open
        projects={projects}
      />,
    );

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

    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        onCreateAgent={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={onOpenChannelsSettings}
        open
        projects={projects}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(screen.getByRole('button', { name: /Open Channels settings/i }));

    expect(onOpenChannelsSettings).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();
    });
  });

  it('uses the centered shared dialog surface motion', () => {
    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        onCreateAgent={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={vi.fn()}
        open
        projects={projects}
      />,
    );

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
});
