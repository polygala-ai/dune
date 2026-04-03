import { describe, expect, it } from 'vitest';

import type { DesktopBridge } from '@/shared/electron/desktop-bridge';

describe('DesktopBridge', () => {
  it('can be constructed with platform and optional methods', () => {
    const bridge: DesktopBridge = {
      platform: 'darwin',
    };

    expect(bridge.platform).toBe('darwin');
    expect(bridge.createAgent).toBeUndefined();
  });

  it('accepts runtime and storage methods', async () => {
    const createAgent = async () => 'agent-1';
    const restartApp = async () => undefined;
    const storageGet = async () => ({ key: 'value' });

    const bridge: DesktopBridge = {
      platform: 'win32',
      createAgent,
      restartApp,
      storageGet,
    };

    expect(await bridge.createAgent?.({ channelId: 'dune-chat', name: 'test' })).toBe('agent-1');
    await expect(bridge.restartApp?.()).resolves.toBeUndefined();
    expect(await bridge.storageGet?.('settings', 'key')).toEqual({ key: 'value' });
  });
});
