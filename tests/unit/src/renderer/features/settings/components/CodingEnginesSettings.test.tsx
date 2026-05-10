// Coding engines settings tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { CodingEnginesSettings } from '@/renderer/features/settings/components/CodingEnginesSettings';
import type { CodingEngineSettings } from '@/renderer/features/settings/model/coding-engine-settings';
import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

interface CodingEngineSettingsStore {
  codingEngineSettings?: Partial<CodingEngineSettings>;
}

/** Reads settings from the test store. */
function readStoredSettings(storedSettings: CodingEngineSettingsStore): CodingEngineSettings {
  return {
    backendModel: '',
    backendType: 'claudeCode',
    enabledEngineIds: ['claude-code', 'codex'],
    ...storedSettings.codingEngineSettings,
  };
}

/** Creates desktop bridge. */
function createDesktopBridge(storedSettings: CodingEngineSettingsStore) {
  return {
    loadCodingEngineSettings: vi.fn(() => Promise.resolve(readStoredSettings(storedSettings))),
    platform: 'darwin' as const,
    restartApp: vi.fn(() => Promise.resolve(undefined)),
    saveCodingEngineSettings: vi.fn((settings: CodingEngineSettings) => {
      storedSettings.codingEngineSettings = settings;
      return Promise.resolve(settings);
    }),
  } satisfies DesktopBridge;
}

/** Renders coding engines settings. */
function renderCodingEnginesSettings() {
  render(
    <CodingEnginesSettings
      agents={[]}
      codingEngines={[
        {
          available: true,
          id: 'claude-code',
          label: 'Claude Code',
          version: '1.2.3',
        },
        {
          available: false,
          id: 'codex',
          label: 'Codex',
          version: null,
        },
      ]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('CodingEnginesSettings', () => {
  it('saves engine preferences and keeps them after dismissing the restart dialog', async () => {
    const user = userEvent.setup();
    const storedSettings: CodingEngineSettingsStore = {
      codingEngineSettings: {
        backendModel: 'gpt-5.4',
        backendType: 'codex',
        enabledEngineIds: ['claude-code', 'codex'],
      },
    };
    window.duneDesktop = createDesktopBridge(storedSettings);

    renderCodingEnginesSettings();

    const codexSwitch = await screen.findByRole('switch', {
      name: 'Enable Codex',
    });
    await user.click(codexSwitch);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Restart to apply coding engine changes',
    });
    expect(dialog).toBeInTheDocument();
    expect(storedSettings.codingEngineSettings).toEqual({
      backendModel: 'gpt-5.4',
      backendType: 'codex',
      enabledEngineIds: ['claude-code'],
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', {
        name: 'Restart to apply coding engine changes',
      })).not.toBeInTheDocument();
    });

    expect(codexSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('restarts the app when the user confirms the restart dialog', async () => {
    const user = userEvent.setup();
    const storedSettings: CodingEngineSettingsStore = {};
    const duneDesktop = createDesktopBridge(storedSettings);
    window.duneDesktop = duneDesktop;

    renderCodingEnginesSettings();

    await user.click(await screen.findByRole('switch', {
      name: 'Enable Codex',
    }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Restart' }));

    expect(duneDesktop.restartApp).toHaveBeenCalledTimes(1);
  });
});
