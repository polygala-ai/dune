// Main-window browser options.

import type { BrowserWindowConstructorOptions } from 'electron';

import { MAC_TITLEBAR_OVERLAY_HEIGHT } from '@/shared/window/titlebar';

/** Creates main window options. */
export function createMainWindowOptions(
  platform: NodeJS.Platform,
  preloadPath: string,
): BrowserWindowConstructorOptions {
  const isMac = platform === 'darwin';

  const options: BrowserWindowConstructorOptions = {
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#f3eee7',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  };

  if (isMac) {
    options.titleBarStyle = 'hidden';
    options.titleBarOverlay = { height: MAC_TITLEBAR_OVERLAY_HEIGHT };
  }

  return options;
}
