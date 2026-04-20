// IPC registration tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerMainIpcHandlers } from '@/electron/main/ipc/register-main-ipc-handlers';
import { ipcChannels } from '@/shared/electron/ipc-channels';

const tempDirs: string[] = [];

/** Creates a temp directory for dialog tests. */
function createTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

/** Creates a registration harness with captured handlers. */
function createHarness() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const workflowStore = {
    delete: vi.fn(async () => {}),
    get: vi.fn(async (key: string) => (key === 'saved' ? 'value' : null)),
    keys: vi.fn(async () => ['saved']),
    set: vi.fn(async () => {}),
  };
  let runtimeReady = false;
  const liveSnapshot = {
    agents: [],
    codingEngines: [],
    externalChannels: {},
    isStreaming: false,
    runtimeInfo: {
      mode: 'real' as const,
      status: 'ready' as const,
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
  };
  const runtimeController = {
    cancelTelegramSetupSession: vi.fn(async () => 'cancelled'),
    createAgent: vi.fn(async () => 'created'),
    deleteAgent: vi.fn(async () => 'deleted'),
    ensureProjectMainAgent: vi.fn(async () => 'ensured'),
    getTelegramSetupSession: vi.fn(async () => 'session'),
    getTranscriptPage: vi.fn(async () => 'transcript'),
    reloadExternalChannels: vi.fn(async () => 'reloaded'),
    reset: vi.fn(async () => 'reset'),
    runIsolatedResearch: vi.fn(async () => 'research'),
    selectAgent: vi.fn(),
    sendAgentMessage: vi.fn(async () => 'sent'),
    startTelegramSetupSession: vi.fn(async () => 'started'),
    updateAgentChannel: vi.fn(async () => 'channel-updated'),
    updateAgentDefinition: vi.fn(async () => 'definition-updated'),
    getSnapshot: vi.fn(() => liveSnapshot),
  };
  const applyPersistedNetworkSettings = vi.fn(async () => {});
  const clipboard = {
    writeText: vi.fn(),
  };
  const deleteLocalData = vi.fn(async () => {});
  const dialog = {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
  };
  const ensureRuntime = vi.fn(async () => {
    runtimeReady = true;
  });
  const ipcMain = {
    handle: vi.fn((channel: string, listener: (...args: any[]) => any) => {
      handlers.set(channel, listener);
    }),
  };
  const restartApp = vi.fn();
  const shell = {
    openExternal: vi.fn(async () => {}),
    openPath: vi.fn(async () => ''),
  };

  registerMainIpcHandlers({
    applyPersistedNetworkSettings,
    clipboard,
    createInitialRuntimeSnapshot: () => ({
      agents: [],
      codingEngines: [],
      externalChannels: {},
      isStreaming: false,
      runtimeInfo: {
        mode: 'mock-fallback' as const,
        status: 'starting' as const,
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    }),
    deleteLocalData,
    dialog,
    ensureRuntime,
    getFocusedWindow: () => null,
    getMainWindow: () => null,
    getProjectActivityPage: vi.fn(async () => 'project-page'),
    getRuntimeController: () => (runtimeReady ? (runtimeController as any) : null),
    ipcMain,
    requireRuntimeController: () => runtimeController as any,
    resolveStore: (name: string) => {
      if (name !== 'workflow') {
        throw new Error(`Unknown store: ${name}`);
      }

      return workflowStore as any;
    },
    restartApp,
    shell,
  });

  return {
    applyPersistedNetworkSettings,
    clipboard,
    deleteLocalData,
    dialog,
    ensureRuntime,
    handlers,
    restartApp,
    runtimeController,
    shell,
    workflowStore,
  };
}

describe('registerMainIpcHandlers', () => {
  it('registers the full main-process handler surface', () => {
    const { handlers } = createHarness();

    expect(handlers.size).toBe(30);
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      ipcChannels.getRuntimeSnapshot,
      ipcChannels.getAgentTranscriptPage,
      ipcChannels.getProjectActivityPage,
      ipcChannels.applyNetworkSettings,
      ipcChannels.copyText,
      ipcChannels.cancelTelegramSetupSession,
      ipcChannels.openExternal,
      ipcChannels.openPath,
      ipcChannels.reloadExternalChannels,
      ipcChannels.getTelegramSetupSession,
      ipcChannels.createAgent,
      ipcChannels.deleteLocalData,
      ipcChannels.ensureProjectMainAgent,
      ipcChannels.ensureProjectArtifactFolder,
      ipcChannels.prepareProjectRootPath,
      ipcChannels.listProjectArtifactEntries,
      ipcChannels.selectProjectDirectory,
      ipcChannels.deleteAgent,
      ipcChannels.selectAgent,
      ipcChannels.updateAgentChannel,
      ipcChannels.updateAgentDefinition,
      ipcChannels.sendAgentMessage,
      ipcChannels.startTelegramSetupSession,
      ipcChannels.resetRuntime,
      ipcChannels.restartApp,
      ipcChannels.runIsolatedResearch,
      ipcChannels.storageGet,
      ipcChannels.storageSet,
      ipcChannels.storageDelete,
      ipcChannels.storageKeys,
    ]));
  });

  it('returns the live runtime snapshot after ensuring bootstrap', async () => {
    const { ensureRuntime, handlers } = createHarness();

    const snapshot = await handlers.get(ipcChannels.getRuntimeSnapshot)?.();

    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(expect.objectContaining({
      runtimeInfo: expect.objectContaining({
        mode: 'real',
        status: 'ready',
      }),
    }));
  });

  it('applies persisted network settings before reloading external channels', async () => {
    const { applyPersistedNetworkSettings, ensureRuntime, handlers, runtimeController } = createHarness();

    const result = await handlers.get(ipcChannels.applyNetworkSettings)?.();

    expect(result).toBe('reloaded');
    expect(applyPersistedNetworkSettings).toHaveBeenCalledTimes(1);
    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(runtimeController.reloadExternalChannels).toHaveBeenCalledTimes(1);
    expect(
      applyPersistedNetworkSettings.mock.invocationCallOrder[0] ?? -1,
    ).toBeLessThan(ensureRuntime.mock.invocationCallOrder[0] ?? -1);
  });

  it('forwards representative storage, dialog, shell, and app handlers', async () => {
    const {
      clipboard,
      dialog,
      deleteLocalData,
      handlers,
      restartApp,
      shell,
      workflowStore,
    } = createHarness();
    const emptyDir = createTempDir('dune-select-project-');

    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [emptyDir],
    });

    await expect(handlers.get(ipcChannels.storageGet)?.({}, 'workflow', 'saved')).resolves.toBe('value');
    expect(workflowStore.get).toHaveBeenCalledWith('saved');

    handlers.get(ipcChannels.copyText)?.({}, 'copied text');
    expect(clipboard.writeText).toHaveBeenCalledWith('copied text');

    await expect(handlers.get(ipcChannels.selectProjectDirectory)?.()).resolves.toBe(emptyDir);

    shell.openPath.mockResolvedValueOnce('not found');
    await expect(handlers.get(ipcChannels.openPath)?.({}, '/tmp/missing')).rejects.toThrow('not found');

    await handlers.get(ipcChannels.deleteLocalData)?.();
    expect(deleteLocalData).toHaveBeenCalledTimes(1);

    handlers.get(ipcChannels.restartApp)?.();
    expect(restartApp).toHaveBeenCalledTimes(1);
  });
});
