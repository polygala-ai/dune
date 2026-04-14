import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';

import { NetworkSettings } from './NetworkSettings';

function createRuntimeSnapshot(): AgentServiceSnapshot {
  return {
    agents: [],
    codingEngines: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
  };
}

function createDesktopBridge(
  storedSettings: Record<string, unknown>,
  runtimeSnapshot: AgentServiceSnapshot = createRuntimeSnapshot(),
) {
  return {
    applyNetworkSettings: vi.fn(async () => undefined),
    getRuntimeSnapshot: vi.fn(async () => runtimeSnapshot),
    platform: 'darwin' as const,
    storageGet: vi.fn(async (_store: string, key: string) => storedSettings[key] ?? null),
    storageSet: vi.fn(async (_store: string, key: string, value: unknown) => {
      storedSettings[key] = value;
    }),
  };
}

function renderNetworkSettings() {
  render(
    <NetworkSettings
      agents={[]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('NetworkSettings', () => {
  it('renders compact mode cards and saves manual proxy settings', async () => {
    const user = userEvent.setup();
    const settingsStore: Record<string, unknown> = {};
    const duneDesktop = createDesktopBridge(settingsStore);
    window.duneDesktop = duneDesktop;

    renderNetworkSettings();

    expect(await screen.findByRole('heading', { name: 'Proxy and transport' })).toBeInTheDocument();
    expect(
      screen.getByText('Applies to renderer traffic and the agent runtime. Telegram reconnects immediately.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No proxy')).toBeInTheDocument();
    expect(screen.getByText('Use desktop/environment proxy settings')).toBeInTheDocument();
    expect(screen.getByText('Use an explicit HTTP proxy URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('HTTP proxy URL')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Manual/i }));

    expect(await screen.findByText('Manual proxy')).toBeInTheDocument();
    await user.type(screen.getByLabelText('HTTP proxy URL'), 'http://127.0.0.1:7890');
    await user.type(screen.getByLabelText('Bypass list'), 'internal.example{enter}localhost');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(duneDesktop.storageSet).toHaveBeenCalledWith('settings', 'network', {
        bypassRules: ['internal.example', 'localhost'],
        manualProxyUrl: 'http://127.0.0.1:7890/',
        mode: 'manual',
      });
      expect(duneDesktop.applyNetworkSettings).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Network settings saved. Changes apply immediately.')).toBeInTheDocument();
  });

  it('shows validation feedback for unsupported authenticated manual proxy URLs', async () => {
    const user = userEvent.setup();
    window.duneDesktop = createDesktopBridge({});

    renderNetworkSettings();

    await user.click(await screen.findByRole('button', { name: /^Manual/i }));
    await user.type(screen.getByLabelText('HTTP proxy URL'), 'http://user:pass@127.0.0.1:7890');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(
      'Failed to save network settings. Error: Manual proxy authentication is not supported yet.',
    )).toBeInTheDocument();
  });

  it('preserves manual field values when switching away from manual mode', async () => {
    const user = userEvent.setup();
    window.duneDesktop = createDesktopBridge({});

    renderNetworkSettings();

    await user.click(await screen.findByRole('button', { name: /^Manual/i }));
    await user.type(screen.getByLabelText('HTTP proxy URL'), 'http://127.0.0.1:7890');
    await user.type(screen.getByLabelText('Bypass list'), 'internal.example');

    await user.click(screen.getByRole('button', { name: /^Direct/i }));
    expect(screen.queryByLabelText('HTTP proxy URL')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Manual/i }));
    expect(await screen.findByLabelText('HTTP proxy URL')).toHaveValue('http://127.0.0.1:7890');
    expect(screen.getByLabelText('Bypass list')).toHaveValue('internal.example');
  });
});
