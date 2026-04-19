// Notification manager and policy checks.

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { createId } from '@/shared/id';
import { isPlainObject } from '@/shared/is-record';
import type { AppStorage } from '@/electron/main/storage';
import type { TelegramBridge } from '@/electron/main/runtime/telegram-bridge';

import { sendMacosNotification } from './macos-notifier';
import { NotificationHistory } from './notification-history';
import { sendTelegramNotification } from './telegram-notifier';
import {
  DEFAULT_SETTINGS,
  NotificationChannel,
  NotificationTrigger,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from './types';

const SETTINGS_KEY = 'notifications';
const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const IDLE_WINDOW_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface NotificationManagerOptions {
  getRuntimeSnapshot: () => AgentServiceSnapshot | null;
  settingsStore: AppStorage;
  telegramBridge?: TelegramBridge | null;
  now?: () => number;
  setIntervalFn?: typeof globalThis.setInterval;
  clearIntervalFn?: typeof globalThis.clearInterval;
  sendMacos?: (title: string, body: string) => void;
  sendTelegram?: (
    telegramBridge: TelegramBridge | null | undefined,
    chatId: string,
    title: string,
    body: string,
  ) => Promise<boolean>;
}

interface NotifyOptions {
  title: string;
  body: string;
  itemId?: string;
  agentId?: string;
}

function cloneSettings(settings: NotificationSettings): NotificationSettings {
  return {
    channels: { ...settings.channels },
    doNotDisturb: { ...settings.doNotDisturb },
    telegramNotifyChatId: settings.telegramNotifyChatId,
    triggers: { ...settings.triggers },
  };
}

function clampHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(23, Math.trunc(value)));
}

function normalizeSettings(value: unknown): NotificationSettings {
  if (!isPlainObject(value)) {
    return cloneSettings(DEFAULT_SETTINGS);
  }

  const triggers = isPlainObject(value.triggers) ? value.triggers : {};
  const channels = isPlainObject(value.channels) ? value.channels : {};
  const doNotDisturb = isPlainObject(value.doNotDisturb) ? value.doNotDisturb : {};

  return {
    triggers: {
      [NotificationTrigger.item_review]:
        typeof triggers[NotificationTrigger.item_review] === 'boolean'
          ? triggers[NotificationTrigger.item_review]
          : DEFAULT_SETTINGS.triggers[NotificationTrigger.item_review],
      [NotificationTrigger.item_acceptance]:
        typeof triggers[NotificationTrigger.item_acceptance] === 'boolean'
          ? triggers[NotificationTrigger.item_acceptance]
          : DEFAULT_SETTINGS.triggers[NotificationTrigger.item_acceptance],
      [NotificationTrigger.agent_error]:
        typeof triggers[NotificationTrigger.agent_error] === 'boolean'
          ? triggers[NotificationTrigger.agent_error]
          : DEFAULT_SETTINGS.triggers[NotificationTrigger.agent_error],
      [NotificationTrigger.budget_warning]:
        typeof triggers[NotificationTrigger.budget_warning] === 'boolean'
          ? triggers[NotificationTrigger.budget_warning]
          : DEFAULT_SETTINGS.triggers[NotificationTrigger.budget_warning],
      [NotificationTrigger.agent_idle]:
        typeof triggers[NotificationTrigger.agent_idle] === 'boolean'
          ? triggers[NotificationTrigger.agent_idle]
          : DEFAULT_SETTINGS.triggers[NotificationTrigger.agent_idle],
    },
    channels: {
      [NotificationChannel.macos]:
        typeof channels[NotificationChannel.macos] === 'boolean'
          ? channels[NotificationChannel.macos]
          : DEFAULT_SETTINGS.channels[NotificationChannel.macos],
      [NotificationChannel.telegram]:
        typeof channels[NotificationChannel.telegram] === 'boolean'
          ? channels[NotificationChannel.telegram]
          : DEFAULT_SETTINGS.channels[NotificationChannel.telegram],
    },
    doNotDisturb: {
      enabled:
        typeof doNotDisturb.enabled === 'boolean'
          ? doNotDisturb.enabled
          : DEFAULT_SETTINGS.doNotDisturb.enabled,
      startHour: clampHour(doNotDisturb.startHour, DEFAULT_SETTINGS.doNotDisturb.startHour),
      endHour: clampHour(doNotDisturb.endHour, DEFAULT_SETTINGS.doNotDisturb.endHour),
    },
    telegramNotifyChatId:
      typeof value.telegramNotifyChatId === 'string'
        ? value.telegramNotifyChatId.trim()
        : DEFAULT_SETTINGS.telegramNotifyChatId,
  };
}

function mergeSettings(
  current: NotificationSettings,
  partial: NotificationSettingsUpdate,
): NotificationSettings {
  return normalizeSettings({
    ...current,
    ...(isPlainObject(partial) ? partial : {}),
    channels: {
      ...current.channels,
      ...(isPlainObject(partial.channels) ? partial.channels : {}),
    },
    doNotDisturb: {
      ...current.doNotDisturb,
      ...(isPlainObject(partial.doNotDisturb) ? partial.doNotDisturb : {}),
    },
    triggers: {
      ...current.triggers,
      ...(isPlainObject(partial.triggers) ? partial.triggers : {}),
    },
  });
}

export class NotificationManager {
  private readonly clearIntervalFn: typeof globalThis.clearInterval;

  private readonly getRuntimeSnapshot: () => AgentServiceSnapshot | null;

  private readonly history = new NotificationHistory();

  private readonly now: () => number;

  private readonly sendMacos: (title: string, body: string) => void;

  private readonly sendTelegram: (
    telegramBridge: TelegramBridge | null | undefined,
    chatId: string,
    title: string,
    body: string,
  ) => Promise<boolean>;

  private readonly settingsStore: AppStorage;

  private readonly telegramBridge: TelegramBridge | null | undefined;

  private readonly throttleMap = new Map<string, number>();

  private readonly idleCheckHandle: ReturnType<typeof globalThis.setInterval>;

  private readonly readyPromise: Promise<void>;

  private settings = cloneSettings(DEFAULT_SETTINGS);

  constructor(options: NotificationManagerOptions) {
    this.clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;
    this.getRuntimeSnapshot = options.getRuntimeSnapshot;
    this.now = options.now ?? (() => Date.now());
    this.sendMacos = options.sendMacos ?? sendMacosNotification;
    this.sendTelegram = options.sendTelegram ?? sendTelegramNotification;
    this.settingsStore = options.settingsStore;
    this.telegramBridge = options.telegramBridge;
    this.readyPromise = this.loadSettings();
    const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
    this.idleCheckHandle = setIntervalFn(() => {
      void this.checkIdleAgents();
    }, IDLE_CHECK_INTERVAL_MS);
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  notify(
    trigger: NotificationTrigger,
    options: NotifyOptions,
  ): void {
    void this.dispatchNotification(trigger, options);
  }

  isInDoNotDisturb(): boolean {
    const { enabled, endHour, startHour } = this.settings.doNotDisturb;

    if (!enabled) {
      return false;
    }

    if (startHour === endHour) {
      return true;
    }

    const hour = new Date(this.now()).getHours();

    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    }

    return hour >= startHour || hour < endHour;
  }

  isThrottled(key: string): boolean {
    const lastSentAt = this.throttleMap.get(key);

    if (lastSentAt === undefined) {
      return false;
    }

    return this.now() - lastSentAt < THROTTLE_WINDOW_MS;
  }

  updateSettings(partial: NotificationSettingsUpdate): NotificationSettings {
    this.settings = mergeSettings(this.settings, partial);
    void this.settingsStore.set(SETTINGS_KEY, this.settings);
    return this.getSettings();
  }

  getSettings(): NotificationSettings {
    return cloneSettings(this.settings);
  }

  getHistory(): NotificationRecord[] {
    return this.history.getAll();
  }

  clearHistory(): void {
    this.history.clear();
  }

  dispose(): void {
    this.clearIntervalFn(this.idleCheckHandle);
  }

  private async loadSettings(): Promise<void> {
    const stored = await this.settingsStore.get<unknown>(SETTINGS_KEY);
    this.settings = normalizeSettings(stored);
  }

  private async dispatchNotification(
    trigger: NotificationTrigger,
    options: NotifyOptions,
  ): Promise<void> {
    await this.readyPromise;

    if (!this.settings.triggers[trigger] || this.isInDoNotDisturb()) {
      return;
    }

    const scopeId = options.itemId?.trim() || options.agentId?.trim() || 'global';
    const throttleKey = `${trigger}:${scopeId}`;

    if (this.isThrottled(throttleKey)) {
      return;
    }

    const timestamp = this.now();
    let delivered = false;

    if (this.settings.channels[NotificationChannel.macos]) {
      this.sendMacos(options.title, options.body);
      this.record({
        body: options.body,
        channel: NotificationChannel.macos,
        timestamp,
        title: options.title,
        trigger,
        ...(options.itemId ? { itemId: options.itemId } : {}),
      });
      delivered = true;
    }

    if (this.settings.channels[NotificationChannel.telegram]) {
      const sent = await this.sendTelegram(
        this.telegramBridge,
        this.settings.telegramNotifyChatId,
        options.title,
        options.body,
      );

      if (sent) {
        this.record({
          body: options.body,
          channel: NotificationChannel.telegram,
          timestamp,
          title: options.title,
          trigger,
          ...(options.itemId ? { itemId: options.itemId } : {}),
        });
        delivered = true;
      }
    }

    if (delivered) {
      this.throttleMap.set(throttleKey, timestamp);
    }
  }

  private record(
    record: Omit<NotificationRecord, 'id'>,
  ): void {
    this.history.add({
      ...record,
      id: createId('notification'),
    });
  }

  private async checkIdleAgents(): Promise<void> {
    await this.readyPromise;

    if (!this.settings.triggers[NotificationTrigger.agent_idle]) {
      return;
    }

    const snapshot = this.getRuntimeSnapshot();

    if (!snapshot) {
      return;
    }

    const now = this.now();

    for (const agent of snapshot.agents) {
      if (agent.status !== 'ready') {
        continue;
      }

      const idleMs = now - agent.updatedAt;

      if (idleMs < IDLE_WINDOW_MS) {
        continue;
      }

      const idleMinutes = Math.floor(idleMs / 60_000);
      this.notify(NotificationTrigger.agent_idle, {
        agentId: agent.id,
        body: `${agent.name} has been idle for ${idleMinutes} minutes.`,
        title: 'Agent idle',
      });
    }
  }
}
