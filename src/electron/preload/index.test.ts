import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';
import { runtimeIpcChannels } from '@/shared/electron/runtime-ipc';

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
        isMac: process.platform === 'darwin',
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
    await desktopBridge?.createAgent?.({
      channelId: 'dune-chat',
      name: 'Navigator',
    });

    const unsubscribe = desktopBridge?.subscribe?.(() => {});

    expect(invoke).toHaveBeenCalledWith(runtimeIpcChannels.getRuntimeSnapshot);
    expect(invoke).toHaveBeenCalledWith(runtimeIpcChannels.createAgent, {
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    expect(on).toHaveBeenCalledWith(
      runtimeIpcChannels.runtimeSnapshotUpdated,
      expect.any(Function),
    );

    unsubscribe?.();

    expect(removeListener).toHaveBeenCalledWith(
      runtimeIpcChannels.runtimeSnapshotUpdated,
      expect.any(Function),
    );
  });
});
