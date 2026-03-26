import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import { runtimeIpcChannels } from '@/shared/electron/runtime-ipc';
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
  runtimeController.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(runtimeIpcChannels.runtimeSnapshotUpdated, snapshot);
    }
  });

  ipcMain.handle(runtimeIpcChannels.getRuntimeSnapshot, () => runtimeController.getSnapshot());
  ipcMain.handle(runtimeIpcChannels.createAgent, (_event, input) =>
    runtimeController.createAgent(input),
  );
  ipcMain.handle(runtimeIpcChannels.selectAgent, (_event, agentId) => {
    runtimeController.selectAgent(agentId);
  });
  ipcMain.handle(runtimeIpcChannels.sendAgentMessage, (_event, agentId, text) =>
    runtimeController.sendAgentMessage(agentId, text),
  );
  ipcMain.handle(runtimeIpcChannels.resetRuntime, () => runtimeController.reset());

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
