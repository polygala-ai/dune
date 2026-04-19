// Notification system types.

export type NotificationTrigger =
  | 'item_review'
  | 'item_acceptance'
  | 'agent_error'
  | 'budget_warning'
  | 'agent_idle';

export interface NotificationSettings {
  triggers: Record<NotificationTrigger, boolean>;
  channels: {
    macos: boolean;
    telegram: boolean;
  };
  doNotDisturb: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  telegramNotifyChatId: string;
}

export interface NotificationSettingsPatch {
  triggers?: Partial<Record<NotificationTrigger, boolean>>;
  channels?: Partial<NotificationSettings['channels']>;
  doNotDisturb?: Partial<NotificationSettings['doNotDisturb']>;
  telegramNotifyChatId?: string;
}

export interface NotificationRecord {
  id: string;
  timestamp: number;
  trigger: NotificationTrigger;
  title: string;
  body: string;
  itemId?: string;
}

export const notificationTriggers: NotificationTrigger[] = [
  'item_review',
  'item_acceptance',
  'agent_error',
  'budget_warning',
  'agent_idle',
];

export function createDefaultNotificationSettings(): NotificationSettings {
  return {
    channels: {
      macos: true,
      telegram: false,
    },
    doNotDisturb: {
      enabled: false,
      endHour: 8,
      startHour: 23,
    },
    telegramNotifyChatId: '',
    triggers: {
      agent_error: true,
      agent_idle: false,
      budget_warning: true,
      item_acceptance: true,
      item_review: true,
    },
  };
}
