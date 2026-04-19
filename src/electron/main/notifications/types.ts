// Notification system types.

export enum NotificationTrigger {
  ItemReview = 'item_review',
  ItemAcceptance = 'item_acceptance',
  AgentError = 'agent_error',
  BudgetWarning = 'budget_warning',
  AgentIdle = 'agent_idle',
}

export enum NotificationChannel {
  MacOS = 'macos',
  Telegram = 'telegram',
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

export interface NotificationSettingsPatch {
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

export const notificationTriggers: NotificationTrigger[] = [
  NotificationTrigger.ItemReview,
  NotificationTrigger.ItemAcceptance,
  NotificationTrigger.AgentError,
  NotificationTrigger.BudgetWarning,
  NotificationTrigger.AgentIdle,
];

export const defaultNotificationSettings: NotificationSettings = {
  triggers: {
    [NotificationTrigger.ItemReview]: true,
    [NotificationTrigger.ItemAcceptance]: true,
    [NotificationTrigger.AgentError]: true,
    [NotificationTrigger.BudgetWarning]: true,
    [NotificationTrigger.AgentIdle]: false,
  },
  channels: {
    [NotificationChannel.MacOS]: true,
    [NotificationChannel.Telegram]: false,
  },
  doNotDisturb: {
    enabled: false,
    startHour: 23,
    endHour: 8,
  },
  telegramNotifyChatId: '',
};

export function createDefaultNotificationSettings(): NotificationSettings {
  return {
    triggers: { ...defaultNotificationSettings.triggers },
    channels: { ...defaultNotificationSettings.channels },
    doNotDisturb: { ...defaultNotificationSettings.doNotDisturb },
    telegramNotifyChatId: defaultNotificationSettings.telegramNotifyChatId,
  };
}
