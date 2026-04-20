// Main-window creation and renderer bootstrap wiring.

import path from 'node:path';
import { BrowserWindow } from 'electron';

import { pushCurrentRuntimeSnapshot } from '@/electron/main/runtime/runtime-snapshot';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import { createMainWindowOptions } from '@/electron/main/window/create-main-window-options';

interface CreateMainWindowArgs {
  getRuntimeController: () => Pick<DesktopRuntimeController, 'getSnapshot'> | null;
  onClosed?: () => void;
  platform: NodeJS.Platform;
  preloadPath: string;
}

/** Creates the main browser window and wires renderer bootstrap events. */
export function createMainWindow(options: CreateMainWindowArgs) {
  const mainWindow = new BrowserWindow(
    createMainWindowOptions(options.platform, options.preloadPath),
  );

  if (options.platform === 'darwin') {
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

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('The Dune renderer process exited unexpectedly.', details);
  });
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
    const runtimeController = options.getRuntimeController();
    if (runtimeController) {
      pushCurrentRuntimeSnapshot(mainWindow, runtimeController);
    }
  });

  mainWindow.on('closed', () => {
    options.onClosed?.();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  return mainWindow;
}
