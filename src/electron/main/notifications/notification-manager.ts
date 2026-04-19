// Notification coordination.

import { createId } from '@/shared/id';
import type { AppStorage } from '@/electron/main/storage';
import type { Agent } from '@/renderer/features/agents/types';

import { NotificationHistory } from './notification-history';
import {
  MacOSNotifier,
  type MacOSNotificationPayload,
} from './macos-notifier';
import {
  TelegramNotifier,
  type TelegramNotificationPayload,
} from './telegram-notifier';
import {
  createDefaultNotificationSettings,
  notificationTriggers,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type NotificationTrigger,
} from './types';

const SETTINGS_KEY = 'notifications';
const NOTIFICATION_THROTTLE_MS = 300_000;
const IDLE_WARNING_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_WARNING_THRESHOLD_MS = 30 * 60 * 1000;

interface AgentLike {
  id: string;
  name: string;
  updatedAt: number;
}

interface NotifyOptions {
  body: string;
  itemId?: string;
  title: string;
}

/** Manager construction options. */
export interface NotificationManagerOptions {
  getAgents?: () => AgentLike[];
  macosNotifier?: Pick<MacOSNotifier, 'send'>;
  now?: () => number;
  setIntervalFn?: typeof globalThis.setInterval;
  store: AppStorage;
  telegramNotifier?: Pick<TelegramNotifier, 'send'>;
}

function clampHour(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(23, Math.trunc(value)));
}

function normalizeNotificationSettings(
  value: unknown,
): NotificationSettings {
  const defaults = createDefaultNotificationSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const triggers = record.triggers && typeof record.triggers === 'object'
    ? record.triggers as Record<string, unknown>
    : {};
  const channels = record.channels && typeof record.channels === 'object'
    ? record.channels as Record<string, unknown>
    : {};
  const doNotDisturb = record.doNotDisturb && typeof record.doNotDisturb === 'object'
    ? record.doNotDisturb as Record<string, unknown>
    : {};

  return {
    channels: {
      macos: typeof channels.macos === 'boolean' ? channels.macos : defaults.channels.macos,
      telegram:
        typeof channels.telegram === 'boolean' ? channels.telegram : defaults.channels.telegram,
    },
    doNotDisturb: {
      enabled:
        typeof doNotDisturb.enabled === 'boolean'
          ? doNotDisturb.enabled
          : defaults.doNotDisturb.enabled,
      endHour: clampHour(doNotDisturb.endHour, defaults.doNotDisturb.endHour),
      startHour: clampHour(doNotDisturb.startHour, defaults.doNotDisturb.startHour),
    },
    telegramNotifyChatId:
      typeof record.telegramNotifyChatId === 'string'
        ? record.telegramNotifyChatId.trim()
        : defaults.telegramNotifyChatId,
    triggers: Object.fromEntries(
      notificationTriggers.map((trigger) => [
        trigger,
        typeof triggers[trigger] === 'boolean'
          ? triggers[trigger]
          : defaults.triggers[trigger],
      ]),
    ) as NotificationSettings['triggers'],
  };
}

function mergeNotificationSettings(
  current: NotificationSettings,
  patch: NotificationSettingsPatch,
): NotificationSettings {
  return normalizeNotificationSettings({
    ...current,
    ...(patch.telegramNotifyChatId !== undefined
      ? { telegramNotifyChatId: patch.telegramNotifyChatId }
      : {}),
    channels: {
      ...current.channels,
      ...(patch.channels ?? {}),
    },
    doNotDisturb: {
      ...current.doNotDisturb,
      ...(patch.doNotDisturb ?? {}),
    },
    triggers: {
      ...current.triggers,
      ...(patch.triggers ?? {}),
    },
  });
}

/** Coordinates notification settings, history, throttling, and delivery. */
export class NotificationManager {
  private readonly history = new NotificationHistory();

  private readonly throttleMap = new Map<string, number>();

  private readonly idleAgentNotifications = new Set<string>();

  private readonly now: () => number;

  private readonly setIntervalFn: typeof globalThis.setInterval;

  private readonly macosNotifier: Pick<MacOSNotifier, 'send'>;

  private readonly telegramNotifier: Pick<TelegramNotifier, 'send'>;

  private readonly getAgents: (() => AgentLike[]) | null;

  private settings: NotificationSettings = createDefaultNotificationSettings();

  private settingsLoaded = false;

  private settingsPromise: Promise<NotificationSettings> | null = null;

  private idleIntervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;

  constructor(private readonly options: NotificationManagerOptions) {
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
    this.macosNotifier = options.macosNotifier ?? { send: () => false };
    this.telegramNotifier = options.telegramNotifier ?? { send: async () => false };
    this.getAgents = options.getAgents ?? null;
  }

  /** Returns the current settings. */
  async getSettings(): Promise<NotificationSettings> {
    return this.ensureSettingsLoaded();
  }

  /** Returns the current history. */
  getHistory(): NotificationRecord[] {
    return this.history.getAll();
  }

  /** Clears the in-memory history. */
  clearHistory(): NotificationRecord[] {
    this.history.clear();
    return this.history.getAll();
  }

  /** Updates the persisted settings with a deep merge. */
  async updateSettings(patch: NotificationSettingsPatch): Promise<NotificationSettings> {
    const currentSettings = await this.ensureSettingsLoaded();
    const nextSettings = mergeNotificationSettings(currentSettings, patch);

    await this.options.store.set(SETTINGS_KEY, nextSettings);
    this.settings = nextSettings;
    this.settingsLoaded = true;

    return nextSettings;
  }

  /** Returns true when the current time falls inside the DnD window. */
  async isInDoNotDisturb(timestamp: number = this.now()) {
    const settings = await this.ensureSettingsLoaded();
    const {
      enabled,
      endHour,
      startHour,
    } = settings.doNotDisturb;

    if (!enabled) {
      return false;
    }

    if (startHour === endHour) {
      return true;
    }

    const currentHour = new Date(timestamp).getHours();

    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }

    return currentHour >= startHour || currentHour < endHour;
  }

  /** Returns true when a key is still inside the notification throttle window. */
  isThrottled(key: string, timestamp: number = this.now()) {
    const lastSentAt = this.throttleMap.get(key);

    return typeof lastSentAt === 'number' && timestamp - lastSentAt < NOTIFICATION_THROTTLE_MS;
  }

  /** Dispatches a notification across all enabled channels. */
  async notify(trigger: NotificationTrigger, options: NotifyOptions): Promise<NotificationRecord | null> {
    const settings = await this.ensureSettingsLoaded();

    if (!settings.triggers[trigger]) {
      return null;
    }

    const timestamp = this.now();

    if (await this.isInDoNotDisturb(timestamp)) {
      return null;
    }

    const throttleKey = `${trigger}:${options.itemId ?? 'global'}`;

    if (this.isThrottled(throttleKey, timestamp)) {
      return null;
    }

    const macosPayload: MacOSNotificationPayload = {
      body: options.body,
      title: options.title,
    };
    const telegramPayload: TelegramNotificationPayload = {
      body: options.body,
      chatId: settings.telegramNotifyChatId,
      title: options.title,
    };

    if (settings.channels.macos) {
      try {
        this.macosNotifier.send(macosPayload);
      } catch (error) {
        console.error('Failed to send a macOS notification.', error);
      }
    }

    if (settings.channels.telegram) {
      try {
        await this.telegramNotifier.send(telegramPayload);
      } catch (error) {
        console.error('Failed to send a Telegram notification.', error);
      }
    }

    const record: NotificationRecord = {
      ...(options.itemId ? { itemId: options.itemId } : {}),
      body: options.body,
      id: createId('notification'),
      timestamp,
      title: options.title,
      trigger,
    };

    this.throttleMap.set(throttleKey, timestamp);
    this.history.add(record);

    return record;
  }

  /** Starts a periodic check for idle agents. */
  startIdleCheck(getAgents: (() => AgentLike[]) | undefined = this.getAgents ?? undefined) {
    if (this.idleIntervalHandle || !getAgents) {
      return;
    }

    this.idleIntervalHandle = this.setIntervalFn(() => {
      void this.checkIdleAgents(getAgents);
    }, IDLE_WARNING_INTERVAL_MS);

    void this.checkIdleAgents(getAgents);
  }

  /** Stops any active idle polling. */
  stop() {
    if (!this.idleIntervalHandle) {
      return;
    }

    globalThis.clearInterval(this.idleIntervalHandle);
    this.idleIntervalHandle = null;
  }

  private async ensureSettingsLoaded(): Promise<NotificationSettings> {
    if (this.settingsLoaded) {
      return this.settings;
    }

    if (!this.settingsPromise) {
      this.settingsPromise = this.options.store
        .get<NotificationSettings>(SETTINGS_KEY)
        .then((storedSettings) => {
          const normalizedSettings = normalizeNotificationSettings(storedSettings);

          this.settings = normalizedSettings;
          this.settingsLoaded = true;

          return normalizedSettings;
        })
        .finally(() => {
          this.settingsPromise = null;
        });
    }

    return this.settingsPromise;
  }

  private async checkIdleAgents(getAgents: () => AgentLike[]) {
    const idleCutoff = this.now() - IDLE_WARNING_THRESHOLD_MS;

    for (const agent of getAgents()) {
      if (agent.updatedAt >= idleCutoff) {
        this.idleAgentNotifications.delete(agent.id);
        continue;
      }

      if (this.idleAgentNotifications.has(agent.id)) {
        continue;
      }

      const notification = await this.notify('agent_idle', {
        body: `${agent.name} has been idle for more than 30 minutes.`,
        itemId: agent.id,
        title: 'Agent idle',
      });

      if (notification) {
        this.idleAgentNotifications.add(agent.id);
      }
    }
  }
}
