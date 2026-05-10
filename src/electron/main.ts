// Electron main-process bootstrap and runtime wiring.

import {
  app,
  BrowserWindow,
  session,
} from 'electron';
import fixPath from 'fix-path';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { createAppRestartController } from '@/electron/main/app-restart';
import { createQuitCoordinator } from '@/electron/main/quit-coordinator';
import { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';
import { registerMainIpcHandlers } from '@/electron/main/ipc/register-main-ipc-handlers';
import { createTelegramPowerCoordinator } from '@/electron/main/lifecycle/telegram-power-coordinator';
import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';
import { DrizzleAgentRuntimeStateRepository } from '@/electron/main/persistence/agent-runtime-state-repository';
import { DrizzleSecretsRepository } from '@/electron/main/persistence/secrets-repository';
import { DrizzleSettingsRepository } from '@/electron/main/persistence/settings-repository';
import { DrizzleWorkflowRepository } from '@/electron/main/persistence/workflow-repository';
import { resetLocalData } from '@/electron/main/reset-local-data';
import { createRuntimeBootstrap } from '@/electron/main/runtime/runtime-bootstrap';
import { migrateLegacyStorageToSqlite } from '@/electron/main/storage';
import {
  createDuneDatabase,
  resolveDuneDatabasePath,
} from '@/electron/main/db';
import { createMainWindow } from '@/electron/main/window/create-main-window';
import { createWorkflowCoordinator } from '@/electron/main/workflow/workflow-coordinator';
import { ipcChannels } from '@/shared/electron/ipc-channels';

// Packaged macOS .app bundles launched from Finder/Dock inherit the login
// PATH, which does not include user-local bins like ~/.local/bin or
// ~/.nvm/.../bin where `claude` / `codex` typically live. Rescue PATH from
// the user's shell before any binary detection runs.
if (app.isPackaged) {
  fixPath();
}

// Prevent GPU compositor crash / black screen on some macOS configurations.
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');

if (started) {
  app.quit();
}

let shutdownMainProcess: () => Promise<void> = () => Promise.resolve();

const quitCoordinator = createQuitCoordinator({
  app,
  onShutdownError: (error) => {
    console.error('Failed to shutdown the Dune runtime cleanly before quit.', error);
  },
  shutdownRuntime: () => shutdownMainProcess(),
});

/** Creates the starting runtime snapshot before the real runtime is ready. */
function createInitialRuntimeSnapshot() {
  return {
    agents: [],
    codingEngines: [],
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
  const database = createDuneDatabase(resolveDuneDatabasePath(userDataDir));
  const secretsRepository = new DrizzleSecretsRepository(database.db);
  const settingsRepository = new DrizzleSettingsRepository(database.db, secretsRepository);
  const agentStateRepository = new DrizzleAgentRuntimeStateRepository(database.db);
  const workflowRepository = new DrizzleWorkflowRepository(database.db);
  let isDatabaseClosed = false;

  await migrateLegacyStorageToSqlite({
    agentStateRepository,
    db: database.db,
    secretsRepository,
    settingsRepository,
    userDataDir,
    workflowRepository,
  });

  const networkProxyManager = new NetworkProxyManager({
    session: session.defaultSession,
  });
  let mainWindow: BrowserWindow | null = null;
  let runtimeBootstrap: ReturnType<typeof createRuntimeBootstrap> | null = null;
  const broadcast = (channel: string, payload?: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (typeof payload === 'undefined') {
        window.webContents.send(channel);
      } else {
        window.webContents.send(channel, payload);
      }
    }
  };
  const getRuntimeController = () => {
    if (!runtimeBootstrap) {
      return null;
    }

    try {
      return runtimeBootstrap.requireRuntimeController();
    } catch {
      return null;
    }
  };
  const requireRuntimeBootstrap = () => {
    if (!runtimeBootstrap) {
      throw new Error('Runtime bootstrap is unavailable.');
    }

    return runtimeBootstrap;
  };
  const workflowCoordinator = createWorkflowCoordinator({
    getRuntimeController,
    notifyWorkflowChanged: () => {
      broadcast(ipcChannels.workflowChanged);
    },
    workflowStore: workflowRepository,
  });
  const telegramPowerCoordinator = createTelegramPowerCoordinator({
    getRuntimeController,
  });

  const createAppRuntimeBootstrap = () =>
    createRuntimeBootstrap({
      agentStore: agentStateRepository,
      app,
      ...(agentLiteHomeDir ? { agentLiteHomeDir } : {}),
      onAgentIdle: workflowCoordinator.onAgentIdle,
      onItemActivityChanged: (payload) => {
        broadcast(ipcChannels.itemActivityUpdated, payload);
      },
      onRuntimeSnapshot: (snapshot) => {
        telegramPowerCoordinator.syncFromSnapshot(snapshot);
        broadcast(ipcChannels.runtimeSnapshotUpdated, snapshot);
      },
      onStarted: workflowCoordinator.start,
      onWorkflowChanged: workflowCoordinator.onWorkflowChanged,
      secretsStore: secretsRepository,
      settingsRepository,
      workflowStore: workflowCoordinator.workflowStore,
    });

  runtimeBootstrap = createAppRuntimeBootstrap();

  const closeDatabase = () => {
    if (!isDatabaseClosed) {
      database.sqlite.close();
      isDatabaseClosed = true;
    }
  };
  const shutdownRuntimeStack = async () => {
    workflowCoordinator.stop();
    telegramPowerCoordinator.shutdown();
    await runtimeBootstrap?.shutdown();
  };

  shutdownMainProcess = shutdownRuntimeStack;

  const applyPersistedNetworkSettings = async () => {
    const settings = await settingsRepository.loadNetworkSettings();
    await networkProxyManager.apply(settings);
  };
  const appRestartController = createAppRestartController({
    hardRestart: () => {
      quitCoordinator.restart();
    },
    isRendererDevMode: Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL),
    reloadRenderer: () => {
      mainWindow?.webContents.reloadIgnoringCache();
    },
    restartRuntimeInProcess: async () => {
      workflowCoordinator.stop();
      await runtimeBootstrap?.shutdown();
      runtimeBootstrap = createAppRuntimeBootstrap();
      await runtimeBootstrap.ensureRuntime();
    },
  });

  registerMainIpcHandlers({
    applyPersistedNetworkSettings,
    createInitialRuntimeSnapshot,
    deleteLocalData: async () => {
      await shutdownRuntimeStack();
      closeDatabase();
      await Promise.allSettled([
        session.defaultSession.clearCache(),
        session.defaultSession.clearStorageData(),
      ]);
      await resetLocalData({
        agentLiteRuntimeRoot,
        userDataDir,
      });
      quitCoordinator.restart();
    },
    ensureRuntime: () => requireRuntimeBootstrap().ensureRuntime(),
    getMainWindow: () => mainWindow,
    getProjectActivityPage: workflowCoordinator.getProjectActivityPage,
    getRuntimeController,
    requireRuntimeController: () => requireRuntimeBootstrap().requireRuntimeController(),
    restartApp: appRestartController.restart,
    settingsRepository,
    workflowStore: workflowCoordinator.workflowStore,
  });

  await applyPersistedNetworkSettings();

  mainWindow = createMainWindow({
    getRuntimeController,
    onClosed: () => {
      mainWindow = null;
    },
    platform: process.platform,
    preloadPath: path.join(__dirname, 'preload.js'),
  });

  runtimeBootstrap.scheduleRuntimeBootstrap(250);
  telegramPowerCoordinator.registerPowerMonitorListeners();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event);
});
