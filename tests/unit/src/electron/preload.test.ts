// Electron preload bridge tests.

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
    await import('@/electron/preload');

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

    await import('@/electron/preload');

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
    await desktopBridge?.getAgentTranscriptPage?.('agent-1', { beforeMessageId: 'message-1', limit: 20 });
    await desktopBridge?.getProjectActivityPage?.('project-1', { beforeEntryId: 'event-1', limit: 20 });
    await desktopBridge?.listProjectArtifactEntries?.('/tmp/project-1', 'homepage-copy-abcd1234');
    await desktopBridge?.copyText?.('@agentlite_test_bot');
    await desktopBridge?.openExternal?.('https://t.me/BotFather');
    await desktopBridge?.openPath?.('/tmp/project-1');
    await desktopBridge?.prepareProjectRootPath?.('/tmp/project-1', ['homepage-copy-abcd1234']);
    await desktopBridge?.reloadExternalChannels?.();
    await desktopBridge?.restartApp?.();
    await desktopBridge?.runIsolatedResearch?.('agent-1', {
      reducerPrompt: 'Merge the findings.',
      sharedPrompt: 'Research each target.',
      targets: [{ brief: 'Alpha brief', title: 'Alpha' }],
    });
    await desktopBridge?.selectProjectDirectory?.();
    await desktopBridge?.getTelegramSetupSession?.('telegram-session-1');
    await desktopBridge?.startTelegramSetupSession?.({ token: 'bot-token' });
    await desktopBridge?.updateAgentChannel?.({
      agentId: 'agent-1',
      channelId: 'dune-chat',
    });

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
      ipcChannels.getAgentTranscriptPage,
      'agent-1',
      { beforeMessageId: 'message-1', limit: 20 },
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.getProjectActivityPage,
      'project-1',
      { beforeEntryId: 'event-1', limit: 20 },
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
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.runIsolatedResearch,
      'agent-1',
      {
        reducerPrompt: 'Merge the findings.',
        sharedPrompt: 'Research each target.',
        targets: [{ brief: 'Alpha brief', title: 'Alpha' }],
      },
    );
    expect(invoke).toHaveBeenCalledWith(ipcChannels.selectProjectDirectory);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.getTelegramSetupSession,
      'telegram-session-1',
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.startTelegramSetupSession,
      { token: 'bot-token' },
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.updateAgentChannel,
      {
        agentId: 'agent-1',
        channelId: 'dune-chat',
      },
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

  it('proxies workflow and settings calls through ipcRenderer', async () => {
    invoke.mockResolvedValue(null);

    await import('@/electron/preload');

    const bridge = exposeInMainWorld.mock.calls[0]?.[1] as
      | DesktopBridge
      | undefined;

    await bridge?.getWorkflowSnapshot?.();
    expect(invoke).toHaveBeenCalledWith(ipcChannels.getWorkflowSnapshot);

    await bridge?.saveWorkflowSnapshot?.({
      items: [],
      projects: [],
      selectedItemId: null,
      selectedProjectFilter: 'all',
      selectedProjectId: null,
      selectedProjectView: 'board',
    });
    expect(invoke).toHaveBeenCalledWith(ipcChannels.saveWorkflowSnapshot, expect.any(Object));

    await bridge?.loadNetworkSettings?.();
    expect(invoke).toHaveBeenCalledWith(ipcChannels.loadNetworkSettings);

    await bridge?.writeModelProviderSecret?.('provider-1', 'secret');
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.writeModelProviderSecret,
      'provider-1',
      'secret',
    );
  });

  it('exposes all expected bridge methods', async () => {
    await import('@/electron/preload');

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
      'getAgentTranscriptPage',
      'getProjectActivityPage',
      'getRuntimeSnapshot',
      'getTelegramSetupSession',
      'getWorkflowSnapshot',
      'listProjectArtifactEntries',
      'loadCodingEngineSettings',
      'loadModelProviders',
      'loadNetworkSettings',
      'openExternal',
      'openPath',
      'prepareProjectRootPath',
      'reloadExternalChannels',
      'resetRuntime',
      'restartApp',
      'runIsolatedResearch',
      'saveCodingEngineSettings',
      'saveModelProviders',
      'saveNetworkSettings',
      'saveWorkflowSnapshot',
      'selectProjectDirectory',
      'selectAgent',
      'sendAgentMessage',
      'startTelegramSetupSession',
      'deleteModelProviderSecret',
      'readModelProviderSecret',
      'updateAgentChannel',
      'writeModelProviderSecret',
      'subscribe',
    ];

    for (const method of expectedMethods) {
      expect(bridge).toHaveProperty(method);
      expect(typeof (bridge as unknown as Record<string, unknown>)?.[method]).toBe('function');
    }
  });
});
