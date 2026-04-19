// Notification system types and normalization helpers.

import { isPlainObject } from '@/shared/is-record';

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

export const NOTIFICATION_SETTINGS_KEY = 'notifications';
export const NOTIFICATION_HISTORY_LIMIT = 50;
export const NOTIFICATION_THROTTLE_MS = 5 * 60_000;
export const AGENT_IDLE_THRESHOLD_MS = 30 * 60_000;
export const AGENT_IDLE_POLL_INTERVAL_MS = 5 * 60_000;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
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

function clampHour(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(23, Math.trunc(value)));
}

function normalizeBooleanRecord<K extends string>(
  value: unknown,
  defaults: Record<K, boolean>,
): Record<K, boolean> {
  if (!isPlainObject(value)) {
    return { ...defaults };
  }

  const next = {} as Record<K, boolean>;

  for (const key of Object.keys(defaults) as K[]) {
    next[key] = typeof value[key] === 'boolean' ? value[key] : defaults[key];
  }

  return next;
}

export function normalizeNotificationSettings(value: unknown): NotificationSettings {
  if (!isPlainObject(value)) {
    return {
      triggers: { ...DEFAULT_NOTIFICATION_SETTINGS.triggers },
      channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels },
      doNotDisturb: { ...DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb },
      telegramNotifyChatId: DEFAULT_NOTIFICATION_SETTINGS.telegramNotifyChatId,
    };
  }

  const doNotDisturb = isPlainObject(value.doNotDisturb) ? value.doNotDisturb : {};

  return {
    triggers: normalizeBooleanRecord(value.triggers, DEFAULT_NOTIFICATION_SETTINGS.triggers),
    channels: normalizeBooleanRecord(value.channels, DEFAULT_NOTIFICATION_SETTINGS.channels),
    doNotDisturb: {
      enabled:
        typeof doNotDisturb.enabled === 'boolean'
          ? doNotDisturb.enabled
          : DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb.enabled,
      startHour: clampHour(
        doNotDisturb.startHour,
        DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb.startHour,
      ),
      endHour: clampHour(
        doNotDisturb.endHour,
        DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb.endHour,
      ),
    },
    telegramNotifyChatId:
      typeof value.telegramNotifyChatId === 'string'
        ? value.telegramNotifyChatId.trim()
        : DEFAULT_NOTIFICATION_SETTINGS.telegramNotifyChatId,
  };
}

export function mergeNotificationSettings(
  current: NotificationSettings,
  partial: NotificationSettingsUpdate,
) {
  return normalizeNotificationSettings({
    ...current,
    ...(partial.triggers
      ? {
          triggers: {
            ...current.triggers,
            ...partial.triggers,
          },
        }
      : {}),
    ...(partial.channels
      ? {
          channels: {
            ...current.channels,
            ...partial.channels,
          },
        }
      : {}),
    ...(partial.doNotDisturb
      ? {
          doNotDisturb: {
            ...current.doNotDisturb,
            ...partial.doNotDisturb,
          },
        }
      : {}),
    ...(partial.telegramNotifyChatId !== undefined
      ? { telegramNotifyChatId: partial.telegramNotifyChatId }
      : {}),
  });
}
