// Notification settings UI.

import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Clock3, Send } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import {
  createDefaultNotificationSettings,
  notificationTriggers,
  NotificationChannel,
  NotificationTrigger,
  type NotificationRecord,
  type NotificationSettings,
} from '@/electron/main/notifications/types';

import { SettingsSectionIntro } from '../components/SettingsSectionIntro';

type FeedbackState =
  | { kind: 'error'; message: string }
  | null;

interface ToggleCardProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}

const AUTO_SAVE_DELAY_MS = 350;
const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

const triggerCopy: Record<NotificationTrigger, { description: string; label: string }> = {
  [NotificationTrigger.AgentError]: {
    description: 'Alert when an agent runtime or scheduled task reports a failure.',
    label: 'Agent errors',
  },
  [NotificationTrigger.AgentIdle]: {
    description: 'Alert when an agent stays inactive for more than 30 minutes.',
    label: 'Agent idle',
  },
  [NotificationTrigger.BudgetWarning]: {
    description: 'Alert when tracked session cost crosses the warning threshold.',
    label: 'Budget warnings',
  },
  [NotificationTrigger.ItemAcceptance]: {
    description: 'Alert when work moves into acceptance and needs human sign-off.',
    label: 'Items moved to acceptance',
  },
  [NotificationTrigger.ItemReview]: {
    description: 'Alert when work moves into review and is ready for feedback.',
    label: 'Items moved to review',
  },
};

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatTriggerLabel(trigger: NotificationTrigger) {
  return triggerCopy[trigger].label;
}

function formatChannelLabel(channel: NotificationChannel) {
  return channel === NotificationChannel.MacOS ? 'macOS' : 'Telegram';
}

/** Reusable switch-style settings card. */
function ToggleCard({
  checked,
  description,
  disabled = false,
  label,
  onToggle,
}: ToggleCardProps) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'flex w-full items-start justify-between gap-4 rounded-[18px] border px-4 py-3 text-left transition-colors',
        checked
          ? 'border-app-accent/40 bg-app-accent-soft text-app-text'
          : 'border-app-border bg-app-card/40 text-app-muted hover:border-app-border-strong hover:bg-app-card hover:text-app-text',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <div className="space-y-1">
        <div className="text-sm font-semibold text-app-text">{label}</div>
        <div className="text-sm leading-6 text-app-muted">{description}</div>
      </div>

      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-app-accent' : 'bg-app-border',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

/** Renders notification settings. */
export function NotificationsSettingsPanel(props: SettingsSectionComponentProps) {
  void props;
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(
    createDefaultNotificationSettings(),
  );
  const hasLoadedRef = useRef(false);
  const lastPersistedSettingsRef = useRef(JSON.stringify(createDefaultNotificationSettings()));
  const latestSaveRevisionRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);

      try {
        const [nextSettings, nextHistory] = await Promise.all([
          window.duneDesktop?.getNotificationSettings?.()
            ?? Promise.resolve(createDefaultNotificationSettings()),
          window.duneDesktop?.getNotificationHistory?.()
            ?? Promise.resolve([]),
        ]);

        if (disposed) {
          return;
        }

        setSettings(nextSettings);
        setHistory(nextHistory);
        setFeedback(null);
        lastPersistedSettingsRef.current = JSON.stringify(nextSettings);
        hasLoadedRef.current = true;
      } catch (error) {
        if (disposed) {
          return;
        }

        setFeedback({
          kind: 'error',
          message: `Failed to load notification settings. ${String(error)}`,
        });
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

  const needsTelegramChatId = settings.channels[NotificationChannel.Telegram]
    && !settings.telegramNotifyChatId.trim();

  useEffect(() => {
    if (!hasLoadedRef.current || isLoading) {
      return undefined;
    }

    const serializedSettings = JSON.stringify(settings);

    if (serializedSettings === lastPersistedSettingsRef.current || needsTelegramChatId) {
      setSaving(false);
      return undefined;
    }

    const saveRevision = latestSaveRevisionRef.current + 1;
    latestSaveRevisionRef.current = saveRevision;
    setSaving(true);
    setFeedback(null);

    const timeoutId = globalThis.setTimeout(() => {
      void (async () => {
        try {
          const nextSettings = await window.duneDesktop?.updateNotificationSettings?.(settings)
            ?? settings;

          if (saveRevision !== latestSaveRevisionRef.current) {
            return;
          }

          lastPersistedSettingsRef.current = JSON.stringify(nextSettings);
          setSettings(nextSettings);
        } catch (error) {
          if (saveRevision !== latestSaveRevisionRef.current) {
            return;
          }

          setFeedback({
            kind: 'error',
            message: `Failed to save notification settings. ${String(error)}`,
          });
        } finally {
          if (saveRevision === latestSaveRevisionRef.current) {
            setSaving(false);
          }
        }
      })();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [isLoading, needsTelegramChatId, settings]);

  const setTrigger = (trigger: NotificationTrigger) => {
    setSettings((current) => ({
      ...current,
      triggers: {
        ...current.triggers,
        [trigger]: !current.triggers[trigger],
      },
    }));
  };

  const handleClearHistory = async () => {
    try {
      const nextHistory = await window.duneDesktop?.clearNotificationHistory?.()
        ?? [];

      setHistory(nextHistory);
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to clear notification history. ${String(error)}`,
      });
    }
  };

  const refreshHistory = async () => {
    try {
      const nextHistory = await window.duneDesktop?.getNotificationHistory?.()
        ?? [];
      setHistory(nextHistory);
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to refresh notification history. ${String(error)}`,
      });
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Let Dune tap you when work changes lanes, agents fail, or the runtime goes quiet."
        eyebrow="Notifications"
        title="Delivery and quiet hours"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Telegram notifications reuse an already configured Telegram bot token. Supply the target
        chat id below when you enable that channel.
      </div>

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-app-text">
          <Bell className="h-4 w-4" />
          Triggers
        </div>
        <div className="mt-4 grid gap-3">
          {notificationTriggers.map((trigger) => (
            <ToggleCard
              checked={settings.triggers[trigger]}
              description={triggerCopy[trigger].description}
              disabled={isLoading}
              key={trigger}
              label={triggerCopy[trigger].label}
              onToggle={() => setTrigger(trigger)}
            />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-app-text">
          <Send className="h-4 w-4" />
          Channels
        </div>
        <div className="mt-4 grid gap-3">
          <ToggleCard
            checked={settings.channels[NotificationChannel.MacOS]}
            description="Use Electron's main-process Notification API to show a local desktop alert."
            disabled={isLoading}
            label="macOS system notifications"
            onToggle={() => setSettings((current) => ({
              ...current,
              channels: {
                ...current.channels,
                [NotificationChannel.MacOS]: !current.channels[NotificationChannel.MacOS],
              },
            }))}
          />
          <ToggleCard
            checked={settings.channels[NotificationChannel.Telegram]}
            description="Send the same alert to a Telegram chat id through the configured Dune bot."
            disabled={isLoading}
            label="Telegram messages"
            onToggle={() => setSettings((current) => ({
              ...current,
              channels: {
                ...current.channels,
                [NotificationChannel.Telegram]: !current.channels[NotificationChannel.Telegram],
              },
            }))}
          />
        </div>

        {settings.channels[NotificationChannel.Telegram] ? (
          <div className="mt-5 space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="notification-telegram-chat-id"
            >
              Telegram chat id
            </label>
            <Input
              disabled={isLoading}
              id="notification-telegram-chat-id"
              onChange={(event) => setSettings((current) => ({
                ...current,
                telegramNotifyChatId: event.target.value,
              }))}
              placeholder="-1001234567890 or tg:-1001234567890"
              value={settings.telegramNotifyChatId}
            />
            <p className="text-sm text-app-muted">
              Use the raw Telegram chat id or the `tg:`-prefixed jid.
            </p>
            {needsTelegramChatId ? (
              <p className="text-sm text-amber-200">
                Enter a chat id before Telegram delivery can be saved.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-app-text">
          <Clock3 className="h-4 w-4" />
          Do Not Disturb
        </div>

        <div className="mt-4">
          <ToggleCard
            checked={settings.doNotDisturb.enabled}
            description="Suppress all notifications during a quiet-hour window, including ranges that cross midnight."
            disabled={isLoading}
            label="Enable quiet hours"
            onToggle={() => setSettings((current) => ({
              ...current,
              doNotDisturb: {
                ...current.doNotDisturb,
                enabled: !current.doNotDisturb.enabled,
              },
            }))}
          />
        </div>

        {settings.doNotDisturb.enabled ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
                htmlFor="notification-dnd-start"
              >
                Start hour
              </label>
              <select
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                id="notification-dnd-start"
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  doNotDisturb: {
                    ...current.doNotDisturb,
                    startHour: Number(event.target.value),
                  },
                }))}
                value={settings.doNotDisturb.startHour}
              >
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
                htmlFor="notification-dnd-end"
              >
                End hour
              </label>
              <select
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                id="notification-dnd-end"
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  doNotDisturb: {
                    ...current.doNotDisturb,
                    endHour: Number(event.target.value),
                  },
                }))}
                value={settings.doNotDisturb.endHour}
              >
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <button
            aria-expanded={isHistoryOpen}
            className="flex items-center gap-2 text-left text-sm font-semibold text-app-text"
            onClick={() => {
              const nextOpen = !isHistoryOpen;
              setHistoryOpen(nextOpen);
              if (nextOpen) {
                void refreshHistory();
              }
            }}
            type="button"
          >
            {isHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Notification history
          </button>

          <Button
            disabled={history.length === 0}
            onClick={() => void handleClearHistory()}
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
        </div>

        {isHistoryOpen ? (
          history.length === 0 ? (
            <div className="mt-4 rounded-[16px] border border-dashed border-app-border px-4 py-6 text-sm text-app-muted">
              No notifications have been recorded in this session.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {history.map((record) => (
                <article
                  className="rounded-[16px] border border-app-border bg-app-card/50 px-4 py-3"
                  key={record.id}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-app-muted">
                    <span>{formatTriggerLabel(record.trigger)}</span>
                    <span>{formatChannelLabel(record.channel)}</span>
                    <span>{formatTimestamp(record.timestamp)}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-app-text">{record.title}</div>
                  <div className="mt-1 text-sm leading-6 text-app-muted">{record.body}</div>
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>

      {feedback ? (
        <div
          className={cn(
            'mt-4 rounded-[16px] border px-4 py-3 text-sm',
            'border-rose-500/30 bg-rose-500/10 text-rose-100',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-4 text-sm text-app-muted">
        {isLoading
          ? 'Loading notification settings…'
          : needsTelegramChatId
            ? 'Telegram delivery stays paused until you enter a chat id.'
            : isSaving
              ? 'Saving changes…'
              : 'Changes save automatically.'}
      </div>
    </>
  );
}
