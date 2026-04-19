// macOS system notification wrapper.

import {
  BrowserWindow,
  Notification,
} from 'electron';

/** macOS system notification payload. */
export interface MacOSNotificationPayload {
  body: string;
  title: string;
}

/** Sends Electron notifications from the main process. */
export class MacOSNotifier {
  constructor(
    private readonly getMainWindow: () => BrowserWindow | null = () => null,
  ) {}

  /** Sends a system notification when supported. */
  send(payload: MacOSNotificationPayload): boolean {
    if (process.platform !== 'darwin' || !Notification.isSupported()) {
      return false;
    }

    const notification = new Notification({
      body: payload.body,
      title: payload.title,
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
