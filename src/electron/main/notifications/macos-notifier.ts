// macOS notification wrapper.

import {
  BrowserWindow,
  Notification,
} from 'electron';

export interface MacOSNotificationPayload {
  title: string;
  body: string;
}

/** Sends Electron main-process notifications on macOS. */
export class MacOSNotifier {
  constructor(
    private readonly getMainWindow: () => BrowserWindow | null = () => null,
  ) {}

  /** Sends a system notification when available. */
  send(payload: MacOSNotificationPayload): boolean {
    if (process.platform !== 'darwin' || !Notification.isSupported()) {
      return false;
    }

    const notification = new Notification({
      title: payload.title,
      body: payload.body,
    });

    notification.on('click', () => {
      this.focusAppWindow();
    });
    notification.show();

    return true;
  }

  private focusAppWindow() {
    const mainWindow = this.getMainWindow()
      ?? BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
      ?? null;

    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    mainWindow.focus();
  }
}
