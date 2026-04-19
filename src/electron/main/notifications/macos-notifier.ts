// Native macOS notification delivery.

import { BrowserWindow, Notification } from 'electron';

export function sendMacosNotification(title: string, body: string): void {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    body,
    silent: false,
    title,
  });

  notification.on('click', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.focus();
    }
  });

  notification.show();
}
