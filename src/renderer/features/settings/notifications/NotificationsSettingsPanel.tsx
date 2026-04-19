// Notification settings UI.

import { useEffect, useRef, useState } from 'react';
import { BellDot, ChevronDown, ChevronUp, History, MessageSquareShare, MoonStar } from 'lucide-react';

import {
  DEFAULT_SETTINGS,
  NotificationChannel,
  NotificationTrigger,
  type NotificationRecord,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '@/electron/main/notifications/types';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

import { SettingsSectionIntro } from '@/renderer/features/settings/components/SettingsSectionIntro';

interface SettingToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}

function SettingToggleRow({
  checked,
  description,
  disabled = false,
  label,
  onToggle,
}: SettingToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-app-border bg-app-card/40 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-app-text">{label}</p>
        <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
      </div>

      <button
        aria-checked={checked}
        aria-label={label}
        className={cn(
          'focus-ring-app inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          checked
            ? 'border-app-accent/40 bg-app-accent/12 text-app-text'
            : 'border-app-border bg-app-panel text-app-muted hover:border-app-border-strong hover:text-app-text',
        )}
        disabled={disabled}
        onClick={onToggle}
        role="switch"
        type="button"
      >
        <span>{checked ? 'On' : 'Off'}</span>
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
            checked ? 'bg-app-accent' : 'bg-app-border',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              checked ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    </div>
  );
}

function mergeSettings(
  current: NotificationSettings,
  partial: NotificationSettingsUpdate,
): NotificationSettings {
  return {
    ...current,
    ...partial,
    channels: {
      ...current.channels,
      ...(partial.channels ?? {}),
    },
    doNotDisturb: {
      ...current.doNotDisturb,
      ...(partial.doNotDisturb ?? {}),
    },
    triggers: {
      ...current.triggers,
      ...(partial.triggers ?? {}),
    },
  };
}

const triggerOptions: Array<{
  description: string;
  id: NotificationTrigger;
  label: string;
}> = [
  {
    description: 'Ping when a work item enters the review lane.',
    id: NotificationTrigger.item_review,
    label: 'Item moved to review',
  },
  {
    description: 'Ping when a work item reaches acceptance.',
    id: NotificationTrigger.item_acceptance,
    label: 'Item moved to acceptance',
  },
  {
    description: 'Ping when an agent task fails in the runtime.',
    id: NotificationTrigger.agent_error,
    label: 'Agent error',
  },
  {
    description: 'Reserved for budget or spend alerts once a source is available.',
    id: NotificationTrigger.budget_warning,
    label: 'Budget warning',
  },
  {
    description: 'Ping when a ready agent stays idle for more than 30 minutes.',
    id: NotificationTrigger.agent_idle,
    label: 'Agent idle >30 min',
  },
];

const channelOptions: Array<{
  description: string;
  icon: typeof BellDot;
  id: NotificationChannel;
  label: string;
}> = [
  {
    description: 'Use the native desktop notification center when supported.',
    icon: BellDot,
    id: NotificationChannel.macos,
    label: 'macOS system notification',
  },
  {
    description: 'Send to the configured Telegram chat when bridge support is available.',
    icon: MessageSquareShare,
    id: NotificationChannel.telegram,
    label: 'Telegram message',
  },
];

const hourOptions = Array.from({ length: 24 }, (_, index) => ({
  label: `${index.toString().padStart(2, '0')}:00`,
  value: index,
}));

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

/** Renders the notifications settings UI. */
export function NotificationsSettingsPanel(props: SettingsSectionComponentProps) {
  void props;
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;

    Promise.all([
      window.duneDesktop?.getNotificationSettings?.() ?? Promise.resolve(DEFAULT_SETTINGS),
      window.duneDesktop?.getNotificationHistory?.() ?? Promise.resolve([]),
    ])
      .then(([loadedSettings, loadedHistory]) => {
        if (!active) {
          return;
        }

        setSettings(loadedSettings ?? DEFAULT_SETTINGS);
        setHistory(loadedHistory ?? []);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setErrorMessage(`Failed to load notification settings. ${String(error)}`);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    let active = true;

    (window.duneDesktop?.getNotificationHistory?.() ?? Promise.resolve([]))
      .then((records) => {
        if (active) {
          setHistory(records ?? []);
        }
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(`Failed to refresh notification history. ${String(error)}`);
        }
      });

    return () => {
      active = false;
    };
  }, [isHistoryOpen]);

  const savePartial = async (partial: NotificationSettingsUpdate) => {
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    setErrorMessage(null);
    setSettings((current) => mergeSettings(current, partial));

    try {
      const nextSettings = await (
        window.duneDesktop?.updateNotificationSettings?.(partial)
        ?? Promise.resolve(mergeSettings(settings, partial))
      );

      if (requestIdRef.current === nextRequestId) {
        setSettings(nextSettings);
      }
    } catch (error) {
      if (requestIdRef.current === nextRequestId) {
        setErrorMessage(`Failed to save notification settings. ${String(error)}`);
      }
    }
  };

  const clearHistory = async () => {
    try {
      await window.duneDesktop?.clearNotificationHistory?.();
      const nextHistory = await (window.duneDesktop?.getNotificationHistory?.() ?? Promise.resolve([]));
      setHistory(nextHistory ?? []);
    } catch (error) {
      setErrorMessage(`Failed to clear notification history. ${String(error)}`);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose which events can interrupt you, where they get delivered, and when Dune should stay quiet."
        eyebrow="Notifications"
        title="Alerts and delivery"
      />

      <div className="mt-6 grid gap-6">
        <section className="rounded-[22px] border border-app-border bg-app-panel/40 p-5">
          <div className="flex items-center gap-3">
            <BellDot className="h-5 w-5 text-app-text" />
            <div>
              <h3 className="text-sm font-semibold text-app-text">Triggers</h3>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                Each trigger can be enabled or muted independently.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {triggerOptions.map((option) => (
              <SettingToggleRow
                checked={settings.triggers[option.id]}
                description={option.description}
                disabled={isLoading}
                key={option.id}
                label={option.label}
                onToggle={() => {
                  void savePartial({
                    triggers: {
                      [option.id]: !settings.triggers[option.id],
                    },
                  });
                }}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-app-border bg-app-panel/40 p-5">
          <div className="flex items-center gap-3">
            <MessageSquareShare className="h-5 w-5 text-app-text" />
            <div>
              <h3 className="text-sm font-semibold text-app-text">Delivery channels</h3>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                A notification is only sent through the channels you leave enabled.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {channelOptions.map((option) => {
              const Icon = option.icon;

              return (
                <div
                  className="rounded-[18px] border border-app-border bg-app-card/40 px-4 py-3"
                  key={option.id}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 text-app-muted" />
                      <div>
                        <p className="text-sm font-medium text-app-text">{option.label}</p>
                        <p className="mt-1 text-xs leading-5 text-app-muted">{option.description}</p>
                      </div>
                    </div>

                    <button
                      aria-checked={settings.channels[option.id]}
                      aria-label={option.label}
                      className={cn(
                        'focus-ring-app inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                        settings.channels[option.id]
                          ? 'border-app-accent/40 bg-app-accent/12 text-app-text'
                          : 'border-app-border bg-app-panel text-app-muted hover:border-app-border-strong hover:text-app-text',
                      )}
                      disabled={isLoading}
                      onClick={() => {
                        void savePartial({
                          channels: {
                            [option.id]: !settings.channels[option.id],
                          },
                        });
                      }}
                      role="switch"
                      type="button"
                    >
                      <span>{settings.channels[option.id] ? 'On' : 'Off'}</span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                          settings.channels[option.id] ? 'bg-app-accent' : 'bg-app-border',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                            settings.channels[option.id] ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {settings.channels[NotificationChannel.telegram] ? (
            <div className="mt-4 space-y-2 rounded-[18px] border border-app-border bg-app-card/30 p-4">
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
                  void savePartial({
                    telegramNotifyChatId: event.target.value,
                  });
                }}
                placeholder="tg:123456789 or chat id"
                value={settings.telegramNotifyChatId}
              />
              <p className="text-xs leading-5 text-app-muted">
                Leave blank to keep Telegram delivery disabled even if the channel toggle is on.
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-[22px] border border-app-border bg-app-panel/40 p-5">
          <div className="flex items-center gap-3">
            <MoonStar className="h-5 w-5 text-app-text" />
            <div>
              <h3 className="text-sm font-semibold text-app-text">Do Not Disturb</h3>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                Suppress notifications inside a quiet-hour window. Cross-midnight ranges are supported.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <SettingToggleRow
              checked={settings.doNotDisturb.enabled}
              description="When enabled, Dune will not send notifications during the selected hours."
              disabled={isLoading}
              label="Quiet hours"
              onToggle={() => {
                void savePartial({
                  doNotDisturb: {
                    enabled: !settings.doNotDisturb.enabled,
                  },
                });
              }}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
                  Start hour
                </span>
                <select
                  className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || !settings.doNotDisturb.enabled}
                  onChange={(event) => {
                    void savePartial({
                      doNotDisturb: {
                        startHour: Number(event.target.value),
                      },
                    });
                  }}
                  value={settings.doNotDisturb.startHour}
                >
                  {hourOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
                  End hour
                </span>
                <select
                  className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || !settings.doNotDisturb.enabled}
                  onChange={(event) => {
                    void savePartial({
                      doNotDisturb: {
                        endHour: Number(event.target.value),
                      },
                    });
                  }}
                  value={settings.doNotDisturb.endHour}
                >
                  {hourOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-app-border bg-app-panel/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-app-text" />
              <div>
                <h3 className="text-sm font-semibold text-app-text">History</h3>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  Stores the last 50 delivered notifications in memory for quick review.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setHistoryOpen((current) => !current)}
              type="button"
              variant="ghost"
            >
              {isHistoryOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
              {isHistoryOpen ? 'Hide history' : 'Show history'}
            </Button>
          </div>

          {isHistoryOpen ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-end">
                <Button
                  disabled={history.length === 0}
                  onClick={() => {
                    void clearHistory();
                  }}
                  type="button"
                  variant="ghost"
                >
                  Clear history
                </Button>
              </div>

              {history.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-app-border bg-app-card/20 px-4 py-5 text-sm text-app-muted">
                  No notifications have been delivered yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {history.map((record) => (
                    <article
                      className="rounded-[18px] border border-app-border bg-app-card/40 px-4 py-3"
                      key={record.id}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-app-muted">
                        <span>{record.channel}</span>
                        <span>•</span>
                        <span>{record.trigger.replace(/_/g, ' ')}</span>
                        <span>•</span>
                        <span>{formatTimestamp(record.timestamp)}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-app-text">{record.title}</p>
                      <p className="mt-1 text-sm leading-6 text-app-muted">{record.body}</p>
                      {record.itemId ? (
                        <p className="mt-2 text-xs text-app-muted">Item: {record.itemId}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <div className="rounded-[16px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </>
  );
}
