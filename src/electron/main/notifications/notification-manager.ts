// Main-process notification orchestration.

import { createId } from '@/shared/id';
import type { Agent } from '@/renderer/features/agents/types';

import type { AppStorage } from '@/electron/main/storage';

import { NotificationHistory } from './notification-history';
import type { MacOsNotifier } from './macos-notifier';
import type { TelegramNotifier } from './telegram-notifier';
import {
  AGENT_IDLE_POLL_INTERVAL_MS,
  AGENT_IDLE_THRESHOLD_MS,
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  normalizeNotificationSettings,
  NOTIFICATION_SETTINGS_KEY,
  NOTIFICATION_THROTTLE_MS,
  NotificationChannel,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsUpdate,
  NotificationTrigger,
} from './types';

/** Notify options. */
export interface NotifyOptions {
  agentId?: string;
  body: string;
  itemId?: string;
  throttleId?: string;
  title: string;
}

/** Notification manager dependencies. */
export interface NotificationManagerOptions {
  getAgents: () => Agent[];
  history?: NotificationHistory;
  macosNotifier: MacOsNotifier;
  now?: () => number;
  settingsStore: AppStorage;
  telegramNotifier: TelegramNotifier;
}

/** Coordinates notification delivery, throttling, and settings persistence. */
export class NotificationManager {
  private readonly getAgents: () => Agent[];

  private readonly history: NotificationHistory;

  private readonly macosNotifier: MacOsNotifier;

  private readonly now: () => number;

  private readonly settingsStore: AppStorage;

  private readonly telegramNotifier: TelegramNotifier;

  private readonly throttleMap = new Map<string, number>();

  private settings: NotificationSettings = {
    triggers: { ...DEFAULT_NOTIFICATION_SETTINGS.triggers },
    channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels },
    doNotDisturb: { ...DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb },
    telegramNotifyChatId: DEFAULT_NOTIFICATION_SETTINGS.telegramNotifyChatId,
  };

  private initializationPromise: Promise<void> | null = null;

  private idlePollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(options: NotificationManagerOptions) {
    this.getAgents = options.getAgents;
    this.history = options.history ?? new NotificationHistory();
    this.macosNotifier = options.macosNotifier;
    this.now = options.now ?? Date.now;
    this.settingsStore = options.settingsStore;
    this.telegramNotifier = options.telegramNotifier;
  }

  /** Loads persisted settings. */
  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const value = await this.settingsStore.get<unknown>(NOTIFICATION_SETTINGS_KEY);
      this.settings = normalizeNotificationSettings(value);
    })();

    return this.initializationPromise;
  }

  /** Starts idle polling. */
  start() {
    if (this.idlePollHandle) {
      return;
    }

    this.idlePollHandle = setInterval(() => {
      void this.checkIdleAgents();
    }, AGENT_IDLE_POLL_INTERVAL_MS);
  }

  /** Stops idle polling. */
  shutdown() {
    if (!this.idlePollHandle) {
      return;
    }

    clearInterval(this.idlePollHandle);
    this.idlePollHandle = null;
  }

  /** Returns current settings. */
  async getSettings() {
    await this.initialize();
    return normalizeNotificationSettings(this.settings);
  }

  /** Returns notification history. */
  getHistory() {
    return this.history.getAll();
  }

  /** Clears notification history. */
  clearHistory() {
    this.history.clear();
  }

  /** Merges and persists settings. */
  async updateSettings(partial: NotificationSettingsUpdate) {
    await this.initialize();
    this.settings = mergeNotificationSettings(this.settings, partial);
    await this.settingsStore.set(NOTIFICATION_SETTINGS_KEY, this.settings);
    return this.getSettings();
  }

  /** Returns whether the current time is inside do-not-disturb hours. */
  isInDoNotDisturb() {
    const { doNotDisturb } = this.settings;

    if (!doNotDisturb.enabled) {
      return false;
    }

    const hour = new Date(this.now()).getHours();

    if (doNotDisturb.startHour === doNotDisturb.endHour) {
      return true;
    }

    if (doNotDisturb.startHour < doNotDisturb.endHour) {
      return hour >= doNotDisturb.startHour && hour < doNotDisturb.endHour;
    }

    return hour >= doNotDisturb.startHour || hour < doNotDisturb.endHour;
  }

  /** Returns whether a notification key is currently throttled. */
  isThrottled(key: string) {
    const lastSentAt = this.throttleMap.get(key) ?? 0;
    return this.now() - lastSentAt < NOTIFICATION_THROTTLE_MS;
  }

  /** Sends notifications through enabled channels. */
  async notify(trigger: NotificationTrigger, options: NotifyOptions) {
    await this.initialize();

    if (!this.settings.triggers[trigger] || this.isInDoNotDisturb()) {
      return false;
    }

    const throttleKey = this.buildThrottleKey(trigger, options);

    if (throttleKey && this.isThrottled(throttleKey)) {
      return false;
    }

    const timestamp = this.now();
    const deliveries = await Promise.all([
      this.settings.channels[NotificationChannel.macos]
        ? this.macosNotifier.send({
            body: options.body,
            title: options.title,
          })
        : Promise.resolve(false),
      this.settings.channels[NotificationChannel.telegram]
        ? this.telegramNotifier.send({
            body: options.body,
            chatId: this.settings.telegramNotifyChatId,
            title: options.title,
          })
        : Promise.resolve(false),
    ]);

    const [macosDelivered, telegramDelivered] = deliveries;

    if (macosDelivered) {
      this.history.add(this.createRecord(NotificationChannel.macos, trigger, options, timestamp));
    }

    if (telegramDelivered) {
      this.history.add(this.createRecord(NotificationChannel.telegram, trigger, options, timestamp));
    }

    if ((macosDelivered || telegramDelivered) && throttleKey) {
      this.throttleMap.set(throttleKey, timestamp);
    }

    return macosDelivered || telegramDelivered;
  }

  private buildThrottleKey(trigger: NotificationTrigger, options: NotifyOptions) {
    const throttleId = options.throttleId ?? options.itemId ?? options.agentId ?? null;
    return throttleId ? `${trigger}:${throttleId}` : null;
  }

  private async checkIdleAgents() {
    await this.initialize();

    if (!this.settings.triggers[NotificationTrigger.agent_idle]) {
      return;
    }

    const threshold = this.now() - AGENT_IDLE_THRESHOLD_MS;

    for (const agent of this.getAgents()) {
      if (
        agent.status !== 'ready'
        || typeof agent.lastActiveAt !== 'number'
        || agent.lastActiveAt >= threshold
      ) {
        continue;
      }

      await this.notify(NotificationTrigger.agent_idle, {
        agentId: agent.id,
        body: `${agent.name} has been idle for more than 30 minutes.`,
        throttleId: agent.id,
        title: 'Agent idle',
      });
    }
  }

  private createRecord(
    channel: NotificationChannel,
    trigger: NotificationTrigger,
    options: NotifyOptions,
    timestamp: number,
  ): NotificationRecord {
    return {
      body: options.body,
      channel,
      id: createId('notification'),
      ...(options.itemId ? { itemId: options.itemId } : {}),
      timestamp,
      title: options.title,
      trigger,
    };
  }
}
