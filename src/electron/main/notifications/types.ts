// Notification system types and defaults.

export enum NotificationTrigger {
  item_review = 'item_review',
  item_acceptance = 'item_acceptance',
  agent_error = 'agent_error',
  budget_warning = 'budget_warning',
  agent_idle = 'agent_idle',
}

export enum NotificationChannel {
  macos = 'macos',
  telegram = 'telegram',
}

export interface NotificationSettings {
  triggers: Record<NotificationTrigger, boolean>;
  channels: Record<NotificationChannel, boolean>;
  doNotDisturb: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  telegramNotifyChatId: string;
}

export interface NotificationSettingsUpdate {
  triggers?: Partial<Record<NotificationTrigger, boolean>>;
  channels?: Partial<Record<NotificationChannel, boolean>>;
  doNotDisturb?: Partial<NotificationSettings['doNotDisturb']>;
  telegramNotifyChatId?: string;
}

export interface NotificationRecord {
  id: string;
  timestamp: number;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  title: string;
  body: string;
  itemId?: string;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  triggers: {
    [NotificationTrigger.item_review]: true,
    [NotificationTrigger.item_acceptance]: true,
    [NotificationTrigger.agent_error]: true,
    [NotificationTrigger.budget_warning]: true,
    [NotificationTrigger.agent_idle]: false,
  },
  channels: {
    [NotificationChannel.macos]: true,
    [NotificationChannel.telegram]: false,
  },
  doNotDisturb: {
    enabled: false,
    startHour: 23,
    endHour: 8,
  },
  telegramNotifyChatId: '',
};
