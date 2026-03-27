import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import { EncryptedFileStorage, JsonFileStorage, type AppStorage } from '@/electron/main/storage';
import { ipcChannels } from '@/shared/electron/ipc-channels';
import { createMainWindowOptions } from '../window/create-main-window-options';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const runtimeController = new DesktopRuntimeController({
  ...(process.env.DUNE_AGENTLITE_HOME_DIR
    ? { homeDir: process.env.DUNE_AGENTLITE_HOME_DIR }
    : {}),
});

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
  const stores: Record<string, AppStorage> = {
    secrets: new EncryptedFileStorage(userDataDir, 'secrets'),
    settings: new JsonFileStorage(userDataDir, 'settings'),
  };

  function resolveStore(name: string): AppStorage {
    const store = stores[name];
    if (!store) throw new Error(`Unknown store: "${name}"`);
    return store;
  }

  runtimeController.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.runtimeSnapshotUpdated, snapshot);
    }
  });

  ipcMain.handle(ipcChannels.getRuntimeSnapshot, () => runtimeController.getSnapshot());
  ipcMain.handle(ipcChannels.createAgent, (_event, input) =>
    runtimeController.createAgent(input),
  );
  ipcMain.handle(ipcChannels.selectAgent, (_event, agentId) => {
    runtimeController.selectAgent(agentId);
  });
  ipcMain.handle(ipcChannels.sendAgentMessage, (_event, agentId, text) =>
    runtimeController.sendAgentMessage(agentId, text),
  );
  ipcMain.handle(ipcChannels.resetRuntime, () => runtimeController.reset());

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
  void runtimeController.shutdown();
});
