// Notification settings panel tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';

import { NotificationsSettingsPanel } from './NotificationsSettingsPanel';

function renderPanel() {
  render(
    <NotificationsSettingsPanel
      agents={[]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('NotificationsSettingsPanel', () => {
  it('auto-saves trigger changes', async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Delivery and quiet hours' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Agent idle/ }));

    await waitFor(() => {
      expect(window.duneDesktop?.updateNotificationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          triggers: expect.objectContaining({
            agent_idle: true,
          }),
        }),
      );
    });
  });

  it('requires a Telegram chat id before saving that channel', async () => {
    const user = userEvent.setup();

    renderPanel();

    await screen.findByRole('heading', { name: 'Delivery and quiet hours' });
    await user.click(screen.getByRole('switch', { name: /Telegram messages/ }));
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 400);
    });

    expect(
      screen.getByText('Telegram delivery stays paused until you enter a chat id.'),
    ).toBeInTheDocument();
    expect(window.duneDesktop?.updateNotificationSettings).not.toHaveBeenCalled();
  });
});
