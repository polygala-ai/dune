import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorld.mockReset();
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
  });
});
