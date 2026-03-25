import type { BrowserWindowConstructorOptions } from 'electron';

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
    options.frame = false;
    options.trafficLightPosition = { x: 18, y: 16 };
  }

  return options;
}
