import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  session,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { AgentIpcManager } from '@/electron/main/agent-ipc/agent-ipc-manager';
import { createBoardHandler } from '@/electron/main/agent-ipc/board-handler';
import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import {
  getBootstrappedRuntimeSnapshot,
  pushCurrentRuntimeSnapshot,
} from '@/electron/main/runtime/runtime-snapshot';
import { resetLocalData } from '@/electron/main/reset-local-data';
import { resolveAgentLiteRuntimeRoot } from '@/electron/runtime-core/agentlite-host';
import { EncryptedFileStorage, JsonFileStorage } from '@/electron/main/storage';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
} from '@/renderer/features/agents/types';
import { loadNetworkSettings } from '@/renderer/features/settings/model/network-settings';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { createQuitCoordinator } from '@/electron/main/quit-coordinator';
import { createMainWindowOptions } from '../window/create-main-window-options';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let networkProxyManager: NetworkProxyManager | null = null;
let runtimeController: DesktopRuntimeController | null = null;
const quitCoordinator = createQuitCoordinator({
  app,
  onShutdownError: (error) => {
    console.error('Failed to shutdown the Dune runtime cleanly before quit.', error);
  },
  shutdownRuntime: async () => {
    await runtimeController?.shutdown();
  },
});

function requireRuntimeController() {
  if (!runtimeController) {
    throw new Error('Runtime controller is unavailable.');
  }

  return runtimeController;
}

function requireNetworkProxyManager() {
  if (!networkProxyManager) {
    throw new Error('Network proxy manager is unavailable.');
  }

  return networkProxyManager;
}

const createWindow = () => {
  mainWindow = new BrowserWindow(
    createMainWindowOptions(process.platform, path.join(__dirname, 'preload.js')),
  );

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).catch((error) => {
      console.error('Failed to load the Dune renderer from the dev server.', error);
    });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    ).catch((error) => {
      console.error('Failed to load the packaged Dune renderer.', error);
    });
  }

  mainWindow.webContents.on(
    'render-process-gone',
    (_event, details) => {
      console.error('The Dune renderer process exited unexpectedly.', details);
    },
  );
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error('The Dune renderer failed to load.', {
        errorCode,
        errorDescription,
        validatedUrl,
      });
    },
  );
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) {
      pushCurrentRuntimeSnapshot(mainWindow, runtimeController);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

function createInitialRuntimeSnapshot() {
  return {
    agents: [],
    externalChannels: {},
    isStreaming: false,
    runtimeInfo: {
      message: 'Starting Dune runtime.',
      mode: 'mock-fallback' as const,
      status: 'starting' as const,
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
  };
}

void app.whenReady().then(async () => {
  const agentLiteHomeDir = process.env.DUNE_AGENTLITE_HOME_DIR;
  const agentLiteRuntimeRoot = resolveAgentLiteRuntimeRoot(agentLiteHomeDir);
  const userDataDir = app.getPath('userData');
  const stores = {
    agents: new JsonFileStorage(userDataDir, 'agents'),
    secrets: new EncryptedFileStorage(userDataDir, 'secrets'),
    settings: new JsonFileStorage(userDataDir, 'settings'),
    workflow: new JsonFileStorage(userDataDir, 'workflow'),
  };

  function resolveStore(name: string) {
    const store = stores[name as keyof typeof stores];
    if (!store) throw new Error(`Unknown store: "${name}"`);
    return store;
  }

  let runtimeBootstrapScheduled = false;
  let runtimeBootstrapPromise: Promise<void> | null = null;
  networkProxyManager = new NetworkProxyManager({
    session: session.defaultSession,
  });

  const applyPersistedNetworkSettings = async () => {
    const settings = await loadNetworkSettings(stores.settings);
    await requireNetworkProxyManager().apply(settings);
  };

  const ensureRuntime = () => {
    if (runtimeBootstrapPromise) {
      return runtimeBootstrapPromise;
    }

    runtimeBootstrapPromise = Promise.all([
      import('@/electron/main/runtime/desktop-runtime-controller'),
      import('@/renderer/features/settings/model/model-providers'),
      import('@/renderer/features/settings/model/telegram-channel'),
    ]).then(async ([
      runtimeControllerModule,
      modelProvidersModule,
      _telegramChannelModule,
    ]) => {
      void _telegramChannelModule;
      const { DesktopRuntimeController } = runtimeControllerModule;
      const {
        migrateModelProviders,
        resolveDefaultModelCredentials,
      } = modelProvidersModule;

      const agentIpcManager = new AgentIpcManager(agentLiteHomeDir ?? require('node:os').homedir());
      agentIpcManager.setBoardMessageHandler(createBoardHandler(stores.workflow, () => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipcChannels.workflowChanged);
        }
      }));

      runtimeController = new DesktopRuntimeController({
        agentIpcManager,
        agentStore: stores.agents,
        ...(agentLiteHomeDir ? { homeDir: agentLiteHomeDir } : {}),
        onIpcDirCreated: (agentId, agentName, projectId, ipcHostPath) => {
          agentIpcManager.addConnection(agentId, agentName, projectId, ipcHostPath);
        },
        resolveModelCredentials: () => resolveDefaultModelCredentials({
          secretsStore: stores.secrets,
          settingsStore: stores.settings,
        }),
        telegramSecretsStore: stores.secrets,
      });

      runtimeController.subscribe((snapshot) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(ipcChannels.runtimeSnapshotUpdated, snapshot);
        }
      });

      await migrateModelProviders({
        secretsStore: stores.secrets,
        settingsStore: stores.settings,
      });
      await runtimeController.start();
      agentIpcManager.start();
    }).catch((error) => {
      console.error('Failed to bootstrap the Dune runtime.', error);
      throw error;
    });

    return runtimeBootstrapPromise;
  };

  const scheduleRuntimeBootstrap = (delayMs: number) => {
    if (runtimeController || runtimeBootstrapScheduled) {
      return;
    }

    runtimeBootstrapScheduled = true;
    setTimeout(() => {
      void ensureRuntime();
    }, delayMs);
  };

  ipcMain.handle(ipcChannels.getRuntimeSnapshot, async () => {
    return getBootstrappedRuntimeSnapshot({
      createInitialRuntimeSnapshot,
      ensureRuntime,
      getRuntimeController: () => runtimeController,
    });
  });
  ipcMain.handle(ipcChannels.applyNetworkSettings, async () => {
    await applyPersistedNetworkSettings();
    await ensureRuntime();
    await requireRuntimeController().reloadExternalChannels();
  });
  ipcMain.handle(ipcChannels.copyText, (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(ipcChannels.cancelTelegramSetupSession, async (_event, sessionId: string) => {
    await ensureRuntime();
    return requireRuntimeController().cancelTelegramSetupSession(sessionId);
  });
  ipcMain.handle(ipcChannels.openExternal, (_event, url: string) => shell.openExternal(url));
  ipcMain.handle(ipcChannels.reloadExternalChannels, async () => {
    await ensureRuntime();
    return requireRuntimeController().reloadExternalChannels();
  });
  ipcMain.handle(ipcChannels.getTelegramSetupSession, async (_event, sessionId: string) => {
    await ensureRuntime();
    return requireRuntimeController().getTelegramSetupSession(sessionId);
  });
  ipcMain.handle(ipcChannels.createAgent, async (_event, input: CreateAgentInput) => {
    await ensureRuntime();
    return requireRuntimeController().createAgent(input);
  });
  ipcMain.handle(ipcChannels.deleteLocalData, async () => {
    await runtimeController?.shutdown();
    await Promise.allSettled([
      session.defaultSession.clearCache(),
      session.defaultSession.clearStorageData(),
    ]);
    await resetLocalData({
      agentLiteRuntimeRoot,
      userDataDir,
    });
    quitCoordinator.restart();
  });
  ipcMain.handle(ipcChannels.ensureProjectMainAgent, async (
    _event,
    projectId: string,
    projectName: string,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().ensureProjectMainAgent(projectId, projectName);
  });
  ipcMain.handle(ipcChannels.deleteAgent, async (_event, agentId: string) => {
    await ensureRuntime();
    return requireRuntimeController().deleteAgent(agentId);
  });
  ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
    await ensureRuntime();
    requireRuntimeController().selectAgent(agentId);
  });
  ipcMain.handle(ipcChannels.sendAgentMessage, async (
    _event,
    agentId: string,
    text: string,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().sendAgentMessage(agentId, text);
  });
  ipcMain.handle(ipcChannels.startTelegramSetupSession, async (
    _event,
    input: StartTelegramSetupSessionInput,
  ) => {
    await ensureRuntime();
    return requireRuntimeController().startTelegramSetupSession(input);
  });
  ipcMain.handle(ipcChannels.resetRuntime, async () => {
    await ensureRuntime();
    return requireRuntimeController().reset();
  });
  ipcMain.handle(ipcChannels.startAgentIpc, async () => {
    await ensureRuntime();
  });
  ipcMain.handle(ipcChannels.stopAgentIpc, async () => {
    await ensureRuntime();
  });
  ipcMain.handle(ipcChannels.restartApp, () => {
    quitCoordinator.restart();
  });

  ipcMain.handle(ipcChannels.storageGet, async (_event, store: string, key: string) =>
    resolveStore(store).get(key),
  );
  ipcMain.handle(
    ipcChannels.storageSet,
    async (_event, store: string, key: string, value: unknown) =>
      resolveStore(store).set(key, value),
  );
  ipcMain.handle(ipcChannels.storageDelete, async (_event, store: string, key: string) =>
    resolveStore(store).delete(key),
  );
  ipcMain.handle(ipcChannels.storageKeys, async (_event, store: string) =>
    resolveStore(store).keys(),
  );

  await applyPersistedNetworkSettings();
  createWindow();
  scheduleRuntimeBootstrap(250);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      scheduleRuntimeBootstrap(250);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event);
});
