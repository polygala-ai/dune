// macOS notification delivery.

import {
  BrowserWindow,
  Notification,
} from 'electron';

/** Delivery payload shape. */
export interface MacOsNotificationPayload {
  body: string;
  title: string;
}

/** macOS system notification wrapper. */
export class MacOsNotifier {
  private readonly getWindow: () => BrowserWindow | null;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
  }

  /** Sends a notification when supported. */
  async send(payload: MacOsNotificationPayload) {
    if (process.platform !== 'darwin' || !Notification.isSupported()) {
      return false;
    }

    const notification = new Notification({
      body: payload.body,
      title: payload.title,
    });

    notification.on('click', () => {
      const window = this.getWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

      if (!window) {
        return;
      }

      if (window.isMinimized()) {
        window.restore();
      }

      if (!window.isVisible()) {
        window.show();
      }

      window.focus();
    });

    notification.show();
    return true;
  }
}
