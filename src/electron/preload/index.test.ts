import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import { ipcChannels } from '@/shared/electron/ipc-channels';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorld.mockReset();
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    vi.resetModules();
  });

  it('exposes a frozen desktop bridge to the renderer', async () => {
    await import('@/electron/preload/index');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'duneDesktop',
      expect.objectContaining({
        platform: process.platform,
      }),
    );

    const desktopBridge = exposeInMainWorld.mock.calls[0]?.[1] as
      | DesktopBridge
      | undefined;

    expect(Object.isFrozen(desktopBridge)).toBe(true);
    expect(desktopBridge?.getRuntimeSnapshot).toBeTypeOf('function');
    expect(desktopBridge?.createAgent).toBeTypeOf('function');
  });

  it('proxies runtime calls and subscriptions through ipcRenderer', async () => {
    invoke.mockResolvedValue({
      agents: [],
      isStreaming: false,
      runtimeInfo: {
        mode: 'real',
        status: 'ready',
      },
      selectedAgentId: null,
    });

    await import('@/electron/preload/index');

    const desktopBridge = exposeInMainWorld.mock.calls[0]?.[1] as
      | DesktopBridge
      | undefined;

    await desktopBridge?.getRuntimeSnapshot?.();
    await desktopBridge?.applyNetworkSettings?.();
    await desktopBridge?.createAgent?.({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    await desktopBridge?.copyText?.('@agentlite_test_bot');
    await desktopBridge?.openExternal?.('https://t.me/BotFather');
    await desktopBridge?.reloadExternalChannels?.();
    await desktopBridge?.restartApp?.();

    const unsubscribe = desktopBridge?.subscribe?.(() => {});

    expect(invoke).toHaveBeenCalledWith(ipcChannels.getRuntimeSnapshot);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.applyNetworkSettings);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.createAgent, {
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    expect(invoke).toHaveBeenCalledWith(ipcChannels.copyText, '@agentlite_test_bot');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.openExternal, 'https://t.me/BotFather');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.reloadExternalChannels);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.restartApp);
    expect(on).toHaveBeenCalledWith(
      ipcChannels.runtimeSnapshotUpdated,
      expect.any(Function),
    );

    unsubscribe?.();

    expect(removeListener).toHaveBeenCalledWith(
      ipcChannels.runtimeSnapshotUpdated,
      expect.any(Function),
    );
  });

  it('proxies storage calls through ipcRenderer', async () => {
    invoke.mockResolvedValue(null);

    await import('@/electron/preload/index');

    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as
      | DesktopBridge
      | undefined;

    await bridge?.storageGet?.('settings', 'theme');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.storageGet, 'settings', 'theme');

    await bridge?.storageSet?.('settings', 'theme', 'dark');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.storageSet, 'settings', 'theme', 'dark');

    await bridge?.storageDelete?.('settings', 'theme');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.storageDelete, 'settings', 'theme');

    await bridge?.storageKeys?.('settings');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.storageKeys, 'settings');
  });

  it('exposes all expected bridge methods', async () => {
    await import('@/electron/preload/index');

    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as
      | DesktopBridge
      | undefined;

    const expectedMethods = [
      'applyNetworkSettings',
      'createAgent',
      'copyText',
      'getRuntimeSnapshot',
      'openExternal',
      'reloadExternalChannels',
      'resetRuntime',
      'restartApp',
      'selectAgent',
      'sendAgentMessage',
      'storageDelete',
      'storageGet',
      'storageKeys',
      'storageSet',
      'subscribe',
    ];

    for (const method of expectedMethods) {
      expect(bridge).toHaveProperty(method);
      expect(typeof (bridge as unknown as Record<string, unknown>)?.[method]).toBe('function');
    }
  });
});
