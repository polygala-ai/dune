// Notification settings panel tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  NotificationChannel,
  NotificationTrigger,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '@/electron/main/notifications/types';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';

import { NotificationsSettingsPanel } from './NotificationsSettingsPanel';

function mergeSettings(
  current: NotificationSettings,
  partial: NotificationSettingsUpdate,
): NotificationSettings {
  return {
    ...current,
    ...partial,
    channels: {
      ...current.channels,
      ...(partial.channels ?? {}),
    },
    doNotDisturb: {
      ...current.doNotDisturb,
      ...(partial.doNotDisturb ?? {}),
    },
    triggers: {
      ...current.triggers,
      ...(partial.triggers ?? {}),
    },
  };
}

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
  it('loads settings, updates trigger toggles, and clears history', async () => {
    const user = userEvent.setup();
    let settings: NotificationSettings = {
      ...DEFAULT_SETTINGS,
      channels: {
        ...DEFAULT_SETTINGS.channels,
        [NotificationChannel.telegram]: true,
      },
      telegramNotifyChatId: 'tg:123',
    };
    let history: NotificationRecord[] = [
      {
        body: 'Write launch copy',
        channel: NotificationChannel.macos,
        id: 'notification-1',
        itemId: 'item-1',
        timestamp: Date.now(),
        title: 'Item moved to review',
        trigger: NotificationTrigger.item_review,
      },
    ];

    window.duneDesktop = {
      ...window.duneDesktop,
      clearNotificationHistory: vi.fn(() => {
        history = [];
        return Promise.resolve();
      }),
      getNotificationHistory: vi.fn(() => Promise.resolve(history)),
      getNotificationSettings: vi.fn(() => Promise.resolve(settings)),
      platform: window.duneDesktop?.platform ?? 'darwin',
      updateNotificationSettings: vi.fn((partial: NotificationSettingsUpdate) => {
        settings = mergeSettings(settings, partial);
        return Promise.resolve(settings);
      }),
    };

    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Alerts and delivery' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('tg:123')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Item moved to review' }));

    await waitFor(() => {
      expect(window.duneDesktop?.updateNotificationSettings).toHaveBeenCalledWith({
        triggers: {
          [NotificationTrigger.item_review]: false,
        },
      });
    });

    await user.click(screen.getByRole('button', { name: /Show history/i }));
    expect(await screen.findByText('Write launch copy')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear history' }));

    await waitFor(() => {
      expect(window.duneDesktop?.clearNotificationHistory).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('No notifications have been delivered yet.')).toBeInTheDocument();
  });
});
