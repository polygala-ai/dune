// Models settings tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { ModelsSettings } from '@/renderer/features/settings/components/ModelsSettings';

/** Store name shape. */
type StoreName = 'secrets' | 'settings';

/** Creates desktop bridge. */
function createDesktopBridge(stores: Record<StoreName, Record<string, unknown>>) {
  return {
    platform: 'darwin' as const,
    restartApp: vi.fn(async () => undefined),
    storageDelete: vi.fn(async (store: string, key: string) => {
      delete stores[store as StoreName][key];
    }),
    storageGet: vi.fn(async (store: string, key: string) => stores[store as StoreName][key] ?? null),
    storageSet: vi.fn(async (store: string, key: string, value: unknown) => {
      stores[store as StoreName][key] = value;
    }),
  };
}

/** Renders models settings. */
function renderModelsSettings() {
  render(
    <ModelsSettings
      agents={[]}
      externalChannels={createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );
}

describe('ModelsSettings', () => {
  it('opens a restart dialog when the default provider changes and keeps the change after cancel', async () => {
    const user = userEvent.setup();
    const stores = {
      secrets: {
        'model-provider:provider-1': 'first-secret',
        'model-provider:provider-2': 'second-secret',
      },
      settings: {
        modelProviders: [
          {
            authType: 'api-key',
            baseUrl: 'https://first.com',
            id: 'provider-1',
            isDefault: false,
            name: 'First',
          },
          {
            authType: 'oauth-token',
            baseUrl: '',
            id: 'provider-2',
            isDefault: false,
            name: 'Second',
          },
        ],
      },
    };
    const duneDesktop = createDesktopBridge(stores);
    window.duneDesktop = duneDesktop;

    renderModelsSettings();

    const firstSwitch = await screen.findByRole('switch', {
      name: 'Default provider First',
    });
    await user.click(firstSwitch);

    const dialog = await screen.findByRole('dialog', {
      name: 'Restart to enable the new default model',
    });
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', {
        name: 'Restart to enable the new default model',
      })).not.toBeInTheDocument();
    });

    expect(firstSwitch).toHaveAttribute('aria-checked', 'true');
    expect(stores.settings.modelProviders).toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        id: 'provider-1',
        isDefault: true,
        name: 'First',
      },
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-2',
        isDefault: false,
        name: 'Second',
      },
    ]);
  });

  it('does not open a restart dialog when editing provider details without changing the default', async () => {
    const user = userEvent.setup();
    const stores = {
      secrets: {
        'model-provider:provider-1': 'first-secret',
      },
      settings: {
        modelProviders: [
          {
            authType: 'api-key',
            baseUrl: 'https://first.com',
            id: 'provider-1',
            isDefault: false,
            name: 'First',
          },
        ],
      },
    };
    window.duneDesktop = createDesktopBridge(stores);

    renderModelsSettings();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByPlaceholderText('Provider name (e.g. OpenAI)'));
    await user.type(screen.getByPlaceholderText('Provider name (e.g. OpenAI)'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Renamed')).toBeInTheDocument();
    });

    expect(screen.queryByRole('dialog', {
      name: 'Restart to enable the new default model',
    })).not.toBeInTheDocument();
  });

  it('restarts the app when the user confirms the restart dialog', async () => {
    const user = userEvent.setup();
    const stores = {
      secrets: {
        'model-provider:provider-1': 'first-secret',
      },
      settings: {
        modelProviders: [
          {
            authType: 'api-key',
            baseUrl: 'https://first.com',
            id: 'provider-1',
            isDefault: false,
            name: 'First',
          },
        ],
      },
    };
    const duneDesktop = createDesktopBridge(stores);
    window.duneDesktop = duneDesktop;

    renderModelsSettings();

    await user.click(await screen.findByRole('switch', {
      name: 'Default provider First',
    }));
    await user.click(await screen.findByRole('button', { name: 'Restart' }));

    expect(duneDesktop.restartApp).toHaveBeenCalledTimes(1);
  });
});
