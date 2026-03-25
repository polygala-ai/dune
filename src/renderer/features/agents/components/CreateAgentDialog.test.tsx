import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';

describe('CreateAgentDialog', () => {
  it('shows a compact channel trigger and renders disabled external channels in the popover', async () => {
    const user = userEvent.setup();

    render(
      <CreateAgentDialog
        onCreateAgent={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={vi.fn()}
        open
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
        onCreateAgent={onCreateAgent}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={vi.fn()}
        open
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
      });
    });
  });

  it('routes to channels settings from the popover shortcut', async () => {
    const user = userEvent.setup();
    const onOpenChannelsSettings = vi.fn();

    render(
      <CreateAgentDialog
        onCreateAgent={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={vi.fn()}
        onOpenChannelsSettings={onOpenChannelsSettings}
        open
      />,
    );

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(screen.getByRole('button', { name: /Open Channels settings/i }));

    expect(onOpenChannelsSettings).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();
    });
  });
});
