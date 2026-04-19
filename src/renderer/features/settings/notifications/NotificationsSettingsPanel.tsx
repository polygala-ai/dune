// Notifications settings UI.

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  NotificationChannel,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsUpdate,
  NotificationTrigger,
} from '@/electron/main/notifications/types';

import { SettingsSectionIntro } from '../components/SettingsSectionIntro';

const triggerOptions = [
  {
    description: 'Alert when a work item enters review.',
    id: NotificationTrigger.item_review,
    label: 'Item moved to review',
  },
  {
    description: 'Alert when a work item reaches acceptance.',
    id: NotificationTrigger.item_acceptance,
    label: 'Item moved to acceptance',
  },
  {
    description: 'Alert when an agent task or run fails.',
    id: NotificationTrigger.agent_error,
    label: 'Agent error',
  },
  {
    description: 'Reserved for budget threshold warnings as budget signals are added.',
    id: NotificationTrigger.budget_warning,
    label: 'Budget warning',
  },
  {
    description: 'Alert when an agent has been inactive for more than 30 minutes.',
    id: NotificationTrigger.agent_idle,
    label: 'Agent idle > 30 min',
  },
] as const;

const channelOptions = [
  {
    description: 'Use the native macOS notification center.',
    icon: Bell,
    id: NotificationChannel.macos,
    label: 'macOS system notification',
  },
  {
    description: 'Mirror notifications to a Telegram chat when a bridge is configured.',
    icon: Send,
    id: NotificationChannel.telegram,
    label: 'Telegram message',
  },
] as const;

type FeedbackState = string | null;

function formatHourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const twelveHour = normalized % 12 || 12;
  return `${twelveHour}:00 ${suffix}`;
}

function formatHistoryTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function createDefaultSettings() {
  return {
    triggers: { ...DEFAULT_NOTIFICATION_SETTINGS.triggers },
    channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels },
    doNotDisturb: { ...DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb },
    telegramNotifyChatId: DEFAULT_NOTIFICATION_SETTINGS.telegramNotifyChatId,
  } satisfies NotificationSettings;
}

interface ToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  onToggle: () => void;
}

function ToggleRow({
  checked,
  description,
  disabled = false,
  icon: Icon,
  label,
  onToggle,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-app-border bg-app-card/30 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-app-muted" /> : null}
          <p className="text-sm font-medium text-app-text">{label}</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
      </div>

      <button
        aria-checked={checked}
        className={cn(
          'focus-ring-app inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
          checked ? 'bg-app-accent' : 'bg-app-border',
        )}
        disabled={disabled}
        onClick={onToggle}
        role="switch"
        type="button"
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

/** Renders the notifications settings UI. */
export function NotificationsSettingsPanel(props: SettingsSectionComponentProps) {
  void props;
  const [settings, setSettings] = useState<NotificationSettings>(createDefaultSettings);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isClearingHistory, setClearingHistory] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [loadedSettings, loadedHistory] = await Promise.all([
          window.duneDesktop?.getNotificationSettings?.(),
          window.duneDesktop?.getNotificationHistory?.(),
        ]);

        if (disposed) {
          return;
        }

        setSettings(loadedSettings ?? createDefaultSettings());
        setHistory(loadedHistory ?? []);
      } catch (error) {
        if (!disposed) {
          setFeedback(`Failed to load notifications settings. ${String(error)}`);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const saveSettings = async (update: NotificationSettingsUpdate) => {
    const desktopBridge = window.duneDesktop;

    if (typeof desktopBridge?.updateNotificationSettings !== 'function') {
      setSettings((current) => mergeNotificationSettings(current, update));
      return;
    }

    setFeedback(null);
    setSettings((current) => mergeNotificationSettings(current, update));

    try {
      const saved = await desktopBridge.updateNotificationSettings(update);
      setSettings(saved);
    } catch (error) {
      setFeedback(`Failed to save notifications settings. ${String(error)}`);
    }
  };

  const clearHistory = async () => {
    if (typeof window.duneDesktop?.clearNotificationHistory !== 'function') {
      setHistory([]);
      return;
    }

    setClearingHistory(true);
    setFeedback(null);

    try {
      await window.duneDesktop.clearNotificationHistory();
      setHistory([]);
    } catch (error) {
      setFeedback(`Failed to clear notification history. ${String(error)}`);
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose which events interrupt you, where they land, and when Dune should stay quiet."
        eyebrow="Notifications"
        title="Heads-up delivery"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Changes save immediately. Item notifications are throttled to one alert per item every five minutes.
      </div>

      <section className="mt-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-app-text">Triggers</h3>
          <p className="mt-1 text-sm text-app-muted">Pick which events generate notifications.</p>
        </div>

        {triggerOptions.map((option) => (
          <ToggleRow
            checked={settings.triggers[option.id]}
            description={option.description}
            disabled={isLoading}
            key={option.id}
            label={option.label}
            onToggle={() => {
              void saveSettings({
                triggers: {
                  [option.id]: !settings.triggers[option.id],
                },
              });
            }}
          />
        ))}
      </section>

      <section className="mt-8 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-app-text">Delivery channels</h3>
          <p className="mt-1 text-sm text-app-muted">Choose where Dune sends each notification.</p>
        </div>

        {channelOptions.map((option) => (
          <ToggleRow
            checked={settings.channels[option.id]}
            description={option.description}
            disabled={isLoading}
            icon={option.icon}
            key={option.id}
            label={option.label}
            onToggle={() => {
              void saveSettings({
                channels: {
                  [option.id]: !settings.channels[option.id],
                },
              });
            }}
          />
        ))}

        {settings.channels.telegram ? (
          <div className="rounded-[18px] border border-app-border bg-app-card/30 p-4">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="notifications-telegram-chat-id"
            >
              Telegram chat ID
            </label>
            <Input
              disabled={isLoading}
              id="notifications-telegram-chat-id"
              onChange={(event) => {
                void saveSettings({
                  telegramNotifyChatId: event.target.value,
                });
              }}
              placeholder="123456789 or tg:123456789"
              value={settings.telegramNotifyChatId}
            />
            <p className="mt-2 text-sm text-app-muted">
              Use the numeric chat id or the full `tg:` jid for the destination chat.
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-8 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-app-text">Do Not Disturb</h3>
          <p className="mt-1 text-sm text-app-muted">Pause notifications during the hours you choose.</p>
        </div>

        <ToggleRow
          checked={settings.doNotDisturb.enabled}
          description="Suppress all notification delivery while the quiet window is active."
          disabled={isLoading}
          label="Enable Do Not Disturb"
          onToggle={() => {
            void saveSettings({
              doNotDisturb: {
                enabled: !settings.doNotDisturb.enabled,
              },
            });
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-app-border bg-app-card/30 p-4">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="notifications-dnd-start"
            >
              Quiet hours start
            </label>
            <select
              className="focus-ring-app mt-2 h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              disabled={isLoading}
              id="notifications-dnd-start"
              onChange={(event) => {
                void saveSettings({
                  doNotDisturb: {
                    startHour: Number(event.target.value),
                  },
                });
              }}
              value={settings.doNotDisturb.startHour}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {formatHourLabel(hour)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[18px] border border-app-border bg-app-card/30 p-4">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="notifications-dnd-end"
            >
              Quiet hours end
            </label>
            <select
              className="focus-ring-app mt-2 h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              disabled={isLoading}
              id="notifications-dnd-end"
              onChange={(event) => {
                void saveSettings({
                  doNotDisturb: {
                    endHour: Number(event.target.value),
                  },
                });
              }}
              value={settings.doNotDisturb.endHour}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {formatHourLabel(hour)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-app-text">History</h3>
            <p className="mt-1 text-sm text-app-muted">Last 50 delivered notifications.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={history.length === 0 || isClearingHistory}
              onClick={() => {
                void clearHistory();
              }}
              type="button"
              variant="ghost"
            >
              {isClearingHistory ? 'Clearing…' : 'Clear'}
            </Button>
            <Button
              onClick={() => setHistoryOpen((current) => !current)}
              type="button"
              variant="outline"
            >
              {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {historyOpen ? 'Hide history' : 'Show history'}
            </Button>
          </div>
        </div>

        {historyOpen ? (
          history.length > 0 ? (
            <div className="mt-4 space-y-3">
              {history.map((record) => (
                <div
                  className="rounded-[16px] border border-app-border bg-app-card/30 px-4 py-3"
                  key={record.id}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
                    <span className="rounded-full border border-app-border px-2 py-1 uppercase tracking-[0.16em]">
                      {record.channel}
                    </span>
                    <span>{formatHistoryTimestamp(record.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-app-text">{record.title}</p>
                  <p className="mt-1 text-sm leading-6 text-app-muted">{record.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[16px] border border-dashed border-app-border px-4 py-6 text-sm text-app-muted">
              No notifications have been delivered in this session yet.
            </div>
          )
        ) : null}
      </section>

      {feedback ? (
        <div className="mt-4 rounded-[16px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {feedback}
        </div>
      ) : null}
    </>
  );
}
