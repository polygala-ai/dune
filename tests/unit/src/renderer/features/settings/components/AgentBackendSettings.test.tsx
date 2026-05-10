// Agent backend settings tests.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { AgentBackendSettings } from '@/renderer/features/settings/components/AgentBackendSettings';
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

/** Renders agent backend settings. */
function renderAgentBackendSettings() {
  render(
    <AgentBackendSettings
      agents={[]}
      codingEngines={[]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('AgentBackendSettings', () => {
  it('saves the selected AgentLite backend without changing engine preferences', async () => {
    const user = userEvent.setup();
    const storedSettings: CodingEngineSettingsStore = {
      codingEngineSettings: {
        backendType: 'claudeCode',
        enabledEngineIds: ['claude-code'],
      },
    };
    window.duneDesktop = createDesktopBridge(storedSettings);

    renderAgentBackendSettings();

    await user.click(await screen.findByRole('radio', {
      name: 'Use Codex backend',
    }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(storedSettings.codingEngineSettings).toEqual({
      backendModel: '',
      backendType: 'codex',
      enabledEngineIds: ['claude-code'],
    });
  });

  it('saves the selected backend model without restarting the app', async () => {
    const user = userEvent.setup();
    const storedSettings: CodingEngineSettingsStore = {};
    const duneDesktop = createDesktopBridge(storedSettings);
    window.duneDesktop = duneDesktop;

    renderAgentBackendSettings();

    await user.click(await screen.findByRole('radio', {
      name: 'Use Codex backend',
    }));
    await user.selectOptions(screen.getByLabelText('Backend model'), 'gpt-5.4');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(storedSettings.codingEngineSettings).toEqual({
      backendModel: 'gpt-5.4',
      backendType: 'codex',
      enabledEngineIds: ['claude-code', 'codex'],
    });
    expect(await screen.findByText(
      'Backend settings saved. The new backend and model apply on the next agent turn.',
    )).toBeInTheDocument();
    expect(duneDesktop.restartApp).not.toHaveBeenCalled();
  });
});
