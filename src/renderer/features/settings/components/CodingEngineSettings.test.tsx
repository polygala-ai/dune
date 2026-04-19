// Coding engine settings tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';

import { CodingEngineSettings } from './CodingEngineSettings';

/** Creates desktop bridge. */
function createDesktopBridge(storedSettings: Record<string, unknown>) {
  return {
    platform: 'darwin' as const,
    storageGet: vi.fn(async (_store: string, key: string) => storedSettings[key] ?? null),
    storageSet: vi.fn(async (_store: string, key: string, value: unknown) => {
      storedSettings[key] = value;
    }),
  };
}

/** Renders coding engine settings. */
function renderCodingEngineSettings(
  codingEngines = [
    {
      available: true,
      id: 'claude-code' as const,
      label: 'Claude Code',
      version: '1.2.3',
    },
    {
      available: true,
      id: 'codex' as const,
      label: 'Codex',
      version: '0.41.0',
    },
  ],
) {
  render(
    <CodingEngineSettings
      agents={[]}
      codingEngines={codingEngines}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('CodingEngineSettings', () => {
  it('loads a disabled persisted state and only shows the selector after re-enabling it', async () => {
    const user = userEvent.setup();
    window.duneDesktop = createDesktopBridge({
      codingEngine: {
        enabled: false,
        selectedEngine: 'codex',
      },
    });

    renderCodingEngineSettings();

    const toggle = await screen.findByRole('switch', { name: 'Enable coding engine' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Engine')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Engine')).toHaveValue('codex');
  });

  it('persists the selected coding engine when saving', async () => {
    const user = userEvent.setup();
    const storedSettings: Record<string, unknown> = {};
    const duneDesktop = createDesktopBridge(storedSettings);
    window.duneDesktop = duneDesktop;

    renderCodingEngineSettings();

    await user.selectOptions(await screen.findByLabelText('Engine'), 'codex');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(duneDesktop.storageSet).toHaveBeenCalledWith('settings', 'codingEngine', {
        enabled: true,
        selectedEngine: 'codex',
      });
    });
    expect(await screen.findByText(
      'Coding engine settings saved. Restart Dune to reconfigure already running agents.',
    )).toBeInTheDocument();
  });
});
