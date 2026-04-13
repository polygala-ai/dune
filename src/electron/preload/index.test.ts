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
    await desktopBridge?.cancelTelegramSetupSession?.('telegram-session-1');
    await desktopBridge?.createAgent?.({
      channelId: 'dune-chat',
      name: 'Navigator',
      projectId: 'project-1',
      projectRootPath: '/tmp/project-1',
    });
    await desktopBridge?.deleteLocalData?.();
    await desktopBridge?.ensureProjectMainAgent?.('project-1', 'Alpha', '/tmp/project-1');
    await desktopBridge?.ensureProjectArtifactFolder?.('/tmp/project-1', 'homepage-copy-abcd1234');
    await desktopBridge?.listProjectArtifactEntries?.('/tmp/project-1', 'homepage-copy-abcd1234');
    await desktopBridge?.copyText?.('@agentlite_test_bot');
    await desktopBridge?.openExternal?.('https://t.me/BotFather');
    await desktopBridge?.openPath?.('/tmp/project-1');
    await desktopBridge?.prepareProjectRootPath?.('/tmp/project-1', ['homepage-copy-abcd1234']);
    await desktopBridge?.reloadExternalChannels?.();
    await desktopBridge?.restartApp?.();
    await desktopBridge?.selectProjectDirectory?.();
    await desktopBridge?.getTelegramSetupSession?.('telegram-session-1');
    await desktopBridge?.startTelegramSetupSession?.({ token: 'bot-token' });

    const listener = vi.fn();
    const unsubscribe = desktopBridge?.subscribe?.(listener);

    expect(invoke).toHaveBeenCalledWith(ipcChannels.getRuntimeSnapshot);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.applyNetworkSettings);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.cancelTelegramSetupSession,
      'telegram-session-1',
    );
    expect(invoke).toHaveBeenCalledWith(ipcChannels.createAgent, {
      channelId: 'dune-chat',
      name: 'Navigator',
      projectId: 'project-1',
      projectRootPath: '/tmp/project-1',
    });
    expect(invoke).toHaveBeenCalledWith(ipcChannels.deleteLocalData);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.ensureProjectMainAgent,
      'project-1',
      'Alpha',
      '/tmp/project-1',
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.ensureProjectArtifactFolder,
      '/tmp/project-1',
      'homepage-copy-abcd1234',
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.listProjectArtifactEntries,
      '/tmp/project-1',
      'homepage-copy-abcd1234',
    );
    expect(invoke).toHaveBeenCalledWith(ipcChannels.copyText, '@agentlite_test_bot');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.openExternal, 'https://t.me/BotFather');
    expect(invoke).toHaveBeenCalledWith(ipcChannels.openPath, '/tmp/project-1');
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.prepareProjectRootPath,
      '/tmp/project-1',
      ['homepage-copy-abcd1234'],
    );
    expect(invoke).toHaveBeenCalledWith(ipcChannels.reloadExternalChannels);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.restartApp);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.selectProjectDirectory);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.getTelegramSetupSession,
      'telegram-session-1',
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.startTelegramSetupSession,
      { token: 'bot-token' },
    );
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
      'cancelTelegramSetupSession',
      'createAgent',
      'copyText',
      'deleteLocalData',
      'ensureProjectArtifactFolder',
      'ensureProjectMainAgent',
      'getRuntimeSnapshot',
      'getTelegramSetupSession',
      'listProjectArtifactEntries',
      'openExternal',
      'openPath',
      'prepareProjectRootPath',
      'reloadExternalChannels',
      'resetRuntime',
      'restartApp',
      'selectProjectDirectory',
      'selectAgent',
      'sendAgentMessage',
      'startTelegramSetupSession',
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
