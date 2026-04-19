// Notification settings UI.

import { useEffect, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Clock3, Send } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import {
  createDefaultNotificationSettings,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationTrigger,
} from '@/electron/main/notifications/types';

import { SettingsSectionIntro } from '../components/SettingsSectionIntro';

type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

interface ToggleCardProps {
  checked: boolean;
  description: string;
  label: string;
  onToggle: () => void;
}

const triggerCopy: Record<NotificationTrigger, { description: string; label: string }> = {
  agent_error: {
    description: 'Alert when an agent runtime or scheduled task reports a failure.',
    label: 'Agent errors',
  },
  agent_idle: {
    description: 'Alert when an agent stays inactive for more than 30 minutes.',
    label: 'Agent idle',
  },
  budget_warning: {
    description: 'Alert when tracked session cost crosses the warning threshold.',
    label: 'Budget warnings',
  },
  item_acceptance: {
    description: 'Alert when work moves into acceptance and needs human sign-off.',
    label: 'Items moved to acceptance',
  },
  item_review: {
    description: 'Alert when work moves into review and is ready for feedback.',
    label: 'Items moved to review',
  },
};

const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatTriggerLabel(trigger: NotificationTrigger) {
  return triggerCopy[trigger].label;
}

/** Reusable switch-style settings card. */
function ToggleCard({
  checked,
  description,
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
      )}
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

  const canSave = !isLoading
    && !isSaving
    && (!settings.channels.telegram || Boolean(settings.telegramNotifyChatId.trim()));

  const setTrigger = (trigger: NotificationTrigger) => {
    setSettings((current) => ({
      ...current,
      triggers: {
        ...current.triggers,
        [trigger]: !current.triggers[trigger],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const nextSettings = await window.duneDesktop?.updateNotificationSettings?.(settings)
        ?? settings;

      setSettings(nextSettings);
      setFeedback({
        kind: 'success',
        message: 'Notification settings saved.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to save notification settings. ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      const nextHistory = await window.duneDesktop?.clearNotificationHistory?.()
        ?? [];

      setHistory(nextHistory);
      setFeedback({
        kind: 'success',
        message: 'Notification history cleared.',
      });
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
          {(Object.keys(triggerCopy) as NotificationTrigger[]).map((trigger) => (
            <ToggleCard
              checked={settings.triggers[trigger]}
              description={triggerCopy[trigger].description}
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
            checked={settings.channels.macos}
            description="Use Electron's main-process Notification API to show a local desktop alert."
            label="macOS system notifications"
            onToggle={() => setSettings((current) => ({
              ...current,
              channels: {
                ...current.channels,
                macos: !current.channels.macos,
              },
            }))}
          />
          <ToggleCard
            checked={settings.channels.telegram}
            description="Send the same alert to a Telegram chat id through the configured Dune bot."
            label="Telegram messages"
            onToggle={() => setSettings((current) => ({
              ...current,
              channels: {
                ...current.channels,
                telegram: !current.channels.telegram,
              },
            }))}
          />
        </div>

        {settings.channels.telegram ? (
          <div className="mt-5 space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="notification-telegram-chat-id"
            >
              Telegram chat id
            </label>
            <Input
              disabled={isLoading || isSaving}
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
            feedback.kind === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-4 flex items-center">
        <Button
          disabled={!canSave}
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
