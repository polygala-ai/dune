import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import { EncryptedFileStorage, JsonFileStorage, type AppStorage } from '@/electron/main/storage';
import {
  migrateModelProviders,
  resolveDefaultModelCredentials,
} from '@/renderer/features/settings/model/model-providers';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { createMainWindowOptions } from '../window/create-main-window-options';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let runtimeController: DesktopRuntimeController | null = null;

function requireRuntimeController() {
  if (!runtimeController) {
    throw new Error('Runtime controller is unavailable.');
  }

  return runtimeController;
}

const createWindow = () => {
  mainWindow = new BrowserWindow(
    createMainWindowOptions(process.platform, path.join(__dirname, 'preload.js')),
  );

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

void app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  const stores = {
    secrets: new EncryptedFileStorage(userDataDir, 'secrets'),
    settings: new JsonFileStorage(userDataDir, 'settings'),
    workflow: new JsonFileStorage(userDataDir, 'workflow'),
  } satisfies Record<string, AppStorage>;

  function resolveStore(name: string): AppStorage {
    const store = stores[name as keyof typeof stores];
    if (!store) throw new Error(`Unknown store: "${name}"`);
    return store;
  }

  const homeDir = process.env.DUNE_AGENTLITE_HOME_DIR;

  return migrateModelProviders({
    secretsStore: stores.secrets,
    settingsStore: stores.settings,
  }).then(() => {
    runtimeController = new DesktopRuntimeController({
      ...(homeDir ? { homeDir } : {}),
      resolveModelCredentials: () => resolveDefaultModelCredentials({
        secretsStore: stores.secrets,
        settingsStore: stores.settings,
      }),
    });

    runtimeController.subscribe((snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(ipcChannels.runtimeSnapshotUpdated, snapshot);
      }
    });

    ipcMain.handle(ipcChannels.getRuntimeSnapshot, () => requireRuntimeController().getSnapshot());
    ipcMain.handle(ipcChannels.createAgent, (_event, input) =>
      requireRuntimeController().createAgent(input),
    );
    ipcMain.handle(ipcChannels.deleteAgent, (_event, agentId) =>
      requireRuntimeController().deleteAgent(agentId),
    );
    ipcMain.handle(ipcChannels.selectAgent, (_event, agentId) => {
      requireRuntimeController().selectAgent(agentId);
    });
    ipcMain.handle(ipcChannels.sendAgentMessage, (_event, agentId, text) =>
      requireRuntimeController().sendAgentMessage(agentId, text),
    );
    ipcMain.handle(ipcChannels.resetRuntime, () => requireRuntimeController().reset());
    ipcMain.handle(ipcChannels.restartApp, () => {
      app.relaunch();
      app.exit(0);
    });

    ipcMain.handle(ipcChannels.storageGet, (_event, store: string, key: string) =>
      resolveStore(store).get(key),
    );
    ipcMain.handle(ipcChannels.storageSet, (_event, store: string, key: string, value: unknown) =>
      resolveStore(store).set(key, value),
    );
    ipcMain.handle(ipcChannels.storageDelete, (_event, store: string, key: string) =>
      resolveStore(store).delete(key),
    );
    ipcMain.handle(ipcChannels.storageKeys, (_event, store: string) =>
      resolveStore(store).keys(),
    );

    return runtimeController.start();
  });
}).then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void runtimeController?.shutdown();
});
