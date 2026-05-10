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
    deleteActivityArchive: vi.fn(async () => {}),
    deleteActivityArchivesExcept: vi.fn(async () => {}),
    readActivityArchive: vi.fn(async () => ({ events: [], lastCompactedAt: null, rollingSummary: null })),
    readSnapshot: vi.fn(async () => ({
      items: [],
      projects: [],
      selectedItemId: null,
      selectedProjectFilter: 'all' as const,
      selectedProjectId: null,
      selectedProjectView: 'board' as const,
    })),
    writeActivityArchive: vi.fn(async () => {}),
    writeSnapshot: vi.fn(async () => {}),
  };
  const settingsRepository = {
    deleteModelProviderSecret: vi.fn(async () => {}),
    loadCodingEngineSettings: vi.fn(async () => ({
      backendModel: '',
      backendType: 'claudeCode',
      enabledEngineIds: [],
    })),
    loadModelProviders: vi.fn(async () => []),
    loadNetworkSettings: vi.fn(async () => ({ bypassRules: [], manualProxyUrl: '', mode: 'system' })),
    readModelProviderSecret: vi.fn(async () => 'secret'),
    saveCodingEngineSettings: vi.fn(async (settings) => settings),
    saveModelProviders: vi.fn(async (providers) => providers),
    saveNetworkSettings: vi.fn(async (settings) => settings),
    writeModelProviderSecret: vi.fn(async () => {}),
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
    applyAgentBackendOptions: vi.fn(async () => undefined),
    cancelTelegramSetupSession: vi.fn(async () => 'cancelled'),
    createAgent: vi.fn(async () => 'created'),
    deleteAgent: vi.fn(async () => 'deleted'),
    ensureProjectMainAgent: vi.fn(async () => 'ensured'),
    getTelegramSetupSession: vi.fn(async () => 'session'),
    getTranscriptPage: vi.fn(async () => 'transcript'),
    reloadExternalChannels: vi.fn(async () => 'reloaded'),
    reloadModelCredentials: vi.fn(async () => undefined),
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
    restartApp,
    settingsRepository: settingsRepository as any,
    shell,
    workflowStore,
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
    settingsRepository,
    shell,
    workflowStore,
  };
}

describe('registerMainIpcHandlers', () => {
  it('registers the full main-process handler surface', () => {
    const { handlers } = createHarness();

    expect(handlers.size).toBe(37);
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
      ipcChannels.getWorkflowSnapshot,
      ipcChannels.saveWorkflowSnapshot,
      ipcChannels.loadModelProviders,
      ipcChannels.saveModelProviders,
      ipcChannels.readModelProviderSecret,
      ipcChannels.writeModelProviderSecret,
      ipcChannels.deleteModelProviderSecret,
      ipcChannels.loadNetworkSettings,
      ipcChannels.saveNetworkSettings,
      ipcChannels.loadCodingEngineSettings,
      ipcChannels.saveCodingEngineSettings,
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

  it('boots the runtime and applies saved backend options when coding settings are saved', async () => {
    const { ensureRuntime, handlers, runtimeController, settingsRepository } = createHarness();
    const settings = {
      backendModel: 'gpt-5.4',
      backendType: 'codex' as const,
      enabledEngineIds: [],
    };

    const saved = await handlers.get(ipcChannels.saveCodingEngineSettings)?.(null, settings);

    expect(saved).toEqual(settings);
    expect(ensureRuntime).toHaveBeenCalledTimes(1);
    expect(settingsRepository.saveCodingEngineSettings).toHaveBeenCalledWith(settings);
    expect(runtimeController.applyAgentBackendOptions).toHaveBeenCalledWith({
      model: 'gpt-5.4',
      type: 'codex',
    });
  });

  it('refreshes runtime credentials after saving model providers without booting runtime', async () => {
    const { ensureRuntime, handlers, runtimeController, settingsRepository } = createHarness();
    const provider = {
      authType: 'api-key',
      baseUrl: '',
      id: 'provider-1',
      isDefault: true,
      name: 'OpenAI',
      providerKind: 'openai',
    };

    await expect(
      handlers.get(ipcChannels.saveModelProviders)?.(null, [provider]),
    ).resolves.toEqual([provider]);
    expect(settingsRepository.saveModelProviders).toHaveBeenCalledWith([provider]);
    expect(ensureRuntime).not.toHaveBeenCalled();
    expect(runtimeController.reloadModelCredentials).not.toHaveBeenCalled();

    await handlers.get(ipcChannels.getRuntimeSnapshot)?.();
    await handlers.get(ipcChannels.writeModelProviderSecret)?.(null, 'provider-1', 'secret');

    expect(runtimeController.reloadModelCredentials).toHaveBeenCalledTimes(1);
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

  it('forwards representative workflow, settings, dialog, shell, and app handlers', async () => {
    const {
      clipboard,
      dialog,
      deleteLocalData,
      handlers,
      restartApp,
      settingsRepository,
      shell,
      workflowStore,
    } = createHarness();
    const emptyDir = createTempDir('dune-select-project-');

    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [emptyDir],
    });

    await expect(handlers.get(ipcChannels.getWorkflowSnapshot)?.()).resolves.toEqual({
      items: [],
      projects: [],
      selectedItemId: null,
      selectedProjectFilter: 'all',
      selectedProjectId: null,
      selectedProjectView: 'board',
    });
    expect(workflowStore.readSnapshot).toHaveBeenCalledTimes(1);

    await expect(handlers.get(ipcChannels.loadNetworkSettings)?.()).resolves.toEqual({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });
    expect(settingsRepository.loadNetworkSettings).toHaveBeenCalledTimes(1);

    handlers.get(ipcChannels.copyText)?.({}, 'copied text');
    expect(clipboard.writeText).toHaveBeenCalledWith('copied text');

    await expect(handlers.get(ipcChannels.selectProjectDirectory)?.()).resolves.toBe(emptyDir);

    shell.openPath.mockResolvedValueOnce('not found');
    await expect(handlers.get(ipcChannels.openPath)?.({}, '/tmp/missing')).rejects.toThrow('not found');

    await handlers.get(ipcChannels.deleteLocalData)?.();
    expect(deleteLocalData).toHaveBeenCalledTimes(1);

    await handlers.get(ipcChannels.restartApp)?.();
    expect(restartApp).toHaveBeenCalledTimes(1);
  });
});
