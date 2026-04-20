// Nuclear settings tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';

import { NuclearSettings } from '@/renderer/features/settings/components/NuclearSettings';

/** Renders nuclear settings. */
function renderNuclearSettings() {
  render(
    <NuclearSettings
      agents={[]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('NuclearSettings', () => {
  it('confirms before deleting local data', async () => {
    const user = userEvent.setup();
    const duneDesktop = {
      deleteLocalData: vi.fn(() => Promise.resolve(undefined)),
      platform: 'darwin' as const,
    };
    window.duneDesktop = duneDesktop;

    renderNuclearSettings();

    expect(await screen.findByRole('heading', { name: 'Factory reset' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete local data' }));
    expect(
      await screen.findByRole('dialog', { name: 'Delete all local data?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete and restart' }));

    await waitFor(() => {
      expect(duneDesktop.deleteLocalData).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces errors when local data deletion fails', async () => {
    const user = userEvent.setup();
    window.duneDesktop = {
      deleteLocalData: vi.fn(() => Promise.reject(new Error('disk busy'))),
      platform: 'darwin',
    };

    renderNuclearSettings();

    await user.click(await screen.findByRole('button', { name: 'Delete local data' }));
    await user.click(screen.getByRole('button', { name: 'Delete and restart' }));

    expect(
      await screen.findByText('Failed to delete local data. Error: disk busy'),
    ).toBeInTheDocument();
  });
});
