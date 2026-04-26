// Electron main-process bootstrap and runtime wiring.

import {
  app,
  BrowserWindow,
  session,
} from 'electron';
import fixPath from 'fix-path';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { createQuitCoordinator } from '@/electron/main/quit-coordinator';
import { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';
import { registerMainIpcHandlers } from '@/electron/main/ipc/register-main-ipc-handlers';
import { createTelegramPowerCoordinator } from '@/electron/main/lifecycle/telegram-power-coordinator';
import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';
import { startPrReviewer, type PrReviewerController } from '@/electron/main/pr-reviewer';
import { resetLocalData } from '@/electron/main/reset-local-data';
import { createRuntimeBootstrap } from '@/electron/main/runtime/runtime-bootstrap';
import { EncryptedFileStorage, JsonFileStorage, type AppStorage } from '@/electron/main/storage';
import { createMainWindow } from '@/electron/main/window/create-main-window';
import { createWorkflowCoordinator } from '@/electron/main/workflow/workflow-coordinator';
import { loadNetworkSettings } from '@/renderer/features/settings/model/network-settings';
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

let shutdownMainProcess = async () => {};

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
  const stores = {
    agents: new JsonFileStorage(userDataDir, 'agents'),
    secrets: new EncryptedFileStorage(userDataDir, 'secrets'),
    settings: new JsonFileStorage(userDataDir, 'settings'),
    workflow: new JsonFileStorage(userDataDir, 'workflow'),
  };
  const networkProxyManager = new NetworkProxyManager({
    session: session.defaultSession,
  });
  let mainWindow: BrowserWindow | null = null;
  let prReviewer: PrReviewerController | null = null;
  let runtimeBootstrap: ReturnType<typeof createRuntimeBootstrap> | null = null;
  const hostActionHandlers = new Map<string, () => Promise<void>>();
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
  const workflowCoordinator = createWorkflowCoordinator({
    getRuntimeController,
    notifyWorkflowChanged: () => {
      broadcast(ipcChannels.workflowChanged);
    },
    workflowStore: stores.workflow,
  });
  const telegramPowerCoordinator = createTelegramPowerCoordinator({
    getRuntimeController,
  });

  runtimeBootstrap = createRuntimeBootstrap({
    agentStore: stores.agents,
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
    secretsStore: stores.secrets,
    settingsStore: stores.settings,
    workflowStore: workflowCoordinator.workflowStore,
  });

  shutdownMainProcess = async () => {
    prReviewer?.stop();
    workflowCoordinator.stop();
    telegramPowerCoordinator.shutdown();
    await runtimeBootstrap?.shutdown();
  };

  const applyPersistedNetworkSettings = async () => {
    const settings = await loadNetworkSettings(stores.settings);
    await networkProxyManager.apply(settings);
  };
  const resolveStore = (name: string): AppStorage => {
    if (name === 'workflow') {
      return workflowCoordinator.workflowStore;
    }

    const store = stores[name as keyof typeof stores];
    if (!store) {
      throw new Error(`Unknown store: "${name}"`);
    }

    return store;
  };

  registerMainIpcHandlers({
    applyPersistedNetworkSettings,
    createInitialRuntimeSnapshot,
    deleteLocalData: async () => {
      await shutdownMainProcess();
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
    ensureRuntime: () => runtimeBootstrap.ensureRuntime(),
    getMainWindow: () => mainWindow,
    getProjectActivityPage: workflowCoordinator.getProjectActivityPage,
    getRuntimeController,
    requireRuntimeController: () => runtimeBootstrap.requireRuntimeController(),
    resolveStore,
    restartApp: () => {
      quitCoordinator.restart();
    },
  });

  await applyPersistedNetworkSettings();

  prReviewer = startPrReviewer({
    app,
    ensureRuntime: () => runtimeBootstrap.ensureRuntime(),
    getRuntimeController: () => runtimeBootstrap.requireRuntimeController(),
    onWorkflowChanged: workflowCoordinator.onWorkflowChanged,
    registerAction: (name, handler) => {
      hostActionHandlers.set(name, handler);
    },
    workflowStore: workflowCoordinator.workflowStore,
  });

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
