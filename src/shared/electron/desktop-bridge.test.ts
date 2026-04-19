// Desktop bridge tests.

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
    const applyNetworkSettings = () => Promise.resolve(undefined);
    const copyText = () => Promise.resolve(undefined);
    const createAgent = () => Promise.resolve('agent-1');
    const deleteLocalData = () => Promise.resolve(undefined);
    const getAgentActivity = () => Promise.resolve({ agents: [] });
    const openExternal = () => Promise.resolve(undefined);
    const reloadExternalChannels = () => Promise.resolve(undefined);
    const restartApp = () => Promise.resolve(undefined);
    const storageGet = () => Promise.resolve({ key: 'value' });
    const updateAgentChannel = () => Promise.resolve(undefined);

    const bridge: DesktopBridge = {
      applyNetworkSettings,
      platform: 'win32',
      copyText,
      createAgent,
      deleteLocalData,
      getAgentActivity,
      openExternal,
      reloadExternalChannels,
      restartApp,
      storageGet,
      updateAgentChannel,
    };

    await expect(bridge.applyNetworkSettings?.()).resolves.toBeUndefined();
    await expect(bridge.copyText?.('@agentlite_test_bot')).resolves.toBeUndefined();
    expect(await bridge.createAgent?.({ channelId: 'dune-chat', name: 'test' })).toBe('agent-1');
    await expect(bridge.deleteLocalData?.()).resolves.toBeUndefined();
    await expect(bridge.getAgentActivity?.()).resolves.toEqual({ agents: [] });
    await expect(bridge.openExternal?.('https://t.me/BotFather')).resolves.toBeUndefined();
    await expect(bridge.reloadExternalChannels?.()).resolves.toBeUndefined();
    await expect(bridge.restartApp?.()).resolves.toBeUndefined();
    expect(await bridge.storageGet?.('settings', 'key')).toEqual({ key: 'value' });
    await expect(bridge.updateAgentChannel?.({ agentId: 'agent-1', channelId: 'dune-chat' })).resolves.toBeUndefined();
  });
});
