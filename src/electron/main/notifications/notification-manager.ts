// Desktop notification trigger helpers.

import { Notification } from 'electron';

/** Notification trigger types emitted by Dune. */
export type NotificationTriggerType = 'sla_warning' | 'sla_breach';

/** Notification payload. */
export interface NotificationPayload {
  body: string;
  itemId: string;
  title: string;
  trigger: NotificationTriggerType;
}

/** Shows desktop notifications for workflow triggers. */
export class NotificationManager {
  notify(payload: NotificationPayload): void {
    if (!Notification.isSupported()) {
      return;
    }

    new Notification({
      body: payload.body,
      title: payload.title,
    }).show();
  }
}
