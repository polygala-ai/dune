import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCcw } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { externalChannelOptions } from '@/renderer/features/agents/model/channels';
import { syncAgentRuntimeSnapshot } from '@/renderer/features/agents/runtime/agent-runtime';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import {
  deleteTelegramBotToken,
  readTelegramBotToken,
  writeTelegramBotToken,
} from '@/renderer/features/settings/model/telegram-channel';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const BOTFATHER_URL = 'https://t.me/BotFather';
const SECRETS_STORE_NAME = 'secrets';

function formatTelegramBotHandle(botUsername: string | null) {
  return botUsername ? `@${botUsername}` : null;
}

function buildTelegramBotUrl(botUsername: string | null) {
  return botUsername ? `https://t.me/${botUsername}` : null;
}

function createSecretsStore() {
  return {
    delete: async (key: string) => {
      await window.duneDesktop?.storageDelete?.(SECRETS_STORE_NAME, key);
    },
    get: async <T,>(key: string): Promise<T | null> => {
      const value = await window.duneDesktop?.storageGet?.(SECRETS_STORE_NAME, key);
      return (value as T | null | undefined) ?? null;
    },
    set: async <T,>(key: string, value: T) => {
      await window.duneDesktop?.storageSet?.(SECRETS_STORE_NAME, key, value);
    },
  };
}

function telegramStatusLabel(status: SettingsSectionComponentProps['externalChannels']['telegram']['status']) {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    default:
      return 'Not configured';
  }
}

type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

export function ChannelsSettings({
  agents,
  externalChannels,
}: SettingsSectionComponentProps) {
  const secretsStore = useMemo(() => createSecretsStore(), []);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoadingToken, setLoadingToken] = useState(true);
  const [isRefreshing, setRefreshing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const telegramState = externalChannels.telegram;
  const telegramBotHandle = formatTelegramBotHandle(telegramState.botUsername);
  const telegramBotUrl = buildTelegramBotUrl(telegramState.botUsername);
  const boundTelegramChatIds = useMemo(
    () =>
      new Set(
        agents
          .filter((agent) => agent.channel.id === 'telegram')
          .map((agent) => agent.channel.target?.jid)
          .filter((jid): jid is string => Boolean(jid)),
      ),
    [agents],
  );

  useEffect(() => {
    setLoadingToken(true);

    readTelegramBotToken(secretsStore)
      .then((token) => {
        setTelegramBotToken(token);
      })
      .catch((error) => {
        setFeedback({
          kind: 'error',
          message: `Failed to load the Telegram token. ${String(error)}`,
        });
      })
      .finally(() => {
        setLoadingToken(false);
      });
  }, [secretsStore]);

  useEffect(() => {
    void syncAgentRuntimeSnapshot('channels-settings-mount').catch((error) => {
      console.debug('Failed to reconcile the Telegram settings snapshot on mount.', error);
    });
  }, []);

  const syncLatestTelegramState = async (reason: string) => {
    const latestSnapshot = await syncAgentRuntimeSnapshot(reason);

    return latestSnapshot.externalChannels.telegram;
  };

  const handleReloadTelegram = async (successMessage: string) => {
    if (typeof window.duneDesktop?.reloadExternalChannels !== 'function') {
      setFeedback({
        kind: 'error',
        message: 'Runtime is still starting. Try again in a moment.',
      });
      return null;
    }

    try {
      await window.duneDesktop.reloadExternalChannels();
      const latestTelegramState = await syncLatestTelegramState('telegram-settings-reload');

      if (latestTelegramState.status === 'error' && latestTelegramState.errorMessage) {
        setFeedback({
          kind: 'error',
          message: latestTelegramState.errorMessage,
        });
        return latestTelegramState;
      }

      setFeedback({ kind: 'success', message: successMessage });
      return latestTelegramState;
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to reload Telegram. ${String(error)}`,
      });

      return null;
    }
  };

  const handleSaveToken = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      await writeTelegramBotToken(secretsStore, telegramBotToken);
      await handleReloadTelegram('Telegram token saved. Dune is reconnecting the bot.');
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to save the Telegram token. ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveToken = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      await deleteTelegramBotToken(secretsStore);
      setTelegramBotToken('');
      await handleReloadTelegram('Telegram token removed. The bot was disconnected.');
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to remove the Telegram token. ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshChats = async () => {
    if (typeof window.duneDesktop?.reloadExternalChannels !== 'function') {
      setFeedback({
        kind: 'error',
        message: 'Runtime is still starting. Try again in a moment.',
      });
      return;
    }

    setRefreshing(true);
    setFeedback(null);

    try {
      await window.duneDesktop.reloadExternalChannels();
      const latestTelegramState = await syncLatestTelegramState('telegram-settings-refresh');
      const discoveredCount = latestTelegramState.discoveredChats.length;
      const latestBotHandle = formatTelegramBotHandle(latestTelegramState.botUsername);

      if (latestTelegramState.status === 'error' && latestTelegramState.errorMessage) {
        setFeedback({
          kind: 'error',
          message: latestTelegramState.errorMessage,
        });
        return;
      }

      setFeedback(
        discoveredCount > 0
          ? {
              kind: 'success',
              message: `Found ${discoveredCount} Telegram chat(s).`,
            }
          : {
              kind: 'success',
              message: latestBotHandle
                ? `No chats found yet. Message ${latestBotHandle} in Telegram, then try again.`
                : 'No chats found yet. Message the connected Telegram bot, then try again.',
            },
      );
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to refresh Telegram chats. ${String(error)}`,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const canRefreshChats = typeof window.duneDesktop?.reloadExternalChannels === 'function'
    && !isRefreshing
    && !isSaving;

  const handleOpenBotFather = () => {
    if (typeof window.duneDesktop?.openExternal === 'function') {
      void window.duneDesktop.openExternal(BOTFATHER_URL);
      return;
    }

    window.open(BOTFATHER_URL, '_blank', 'noopener,noreferrer');
  };

  const handleOpenTelegramBot = () => {
    if (!telegramBotUrl) {
      return;
    }

    if (typeof window.duneDesktop?.openExternal === 'function') {
      void window.duneDesktop.openExternal(telegramBotUrl);
      return;
    }

    window.open(telegramBotUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyTelegramBot = async () => {
    if (!telegramBotHandle) {
      return;
    }

    try {
      if (typeof window.duneDesktop?.copyText === 'function') {
        try {
          await window.duneDesktop.copyText(telegramBotHandle);
        } catch (error) {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(telegramBotHandle);
          } else {
            throw error;
          }
        }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(telegramBotHandle);
      } else {
        throw new Error('Copy is unavailable in this environment.');
      }

      setFeedback({
        kind: 'success',
        message: `Copied ${telegramBotHandle}.`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to copy the Telegram bot username. ${String(error)}`,
      });
    }
  };

  return (
    <>
      <SettingsSectionIntro
        eyebrow="Channels"
        title="Channels"
      />

      <section
        className="mt-6 rounded-[24px] border border-app-border bg-app-card/60 p-5"
        data-testid="telegram-settings-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-app-text">Telegram</h3>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              Connect a Telegram bot once, then attach agents to discovered chats.
            </p>
          </div>
          <span className="pill-key shrink-0">
            {telegramStatusLabel(telegramState.status)}
          </span>
        </div>

        <div className="mt-5 space-y-2">
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
            htmlFor="telegram-bot-token"
          >
            Bot token
          </label>
          <Input
            autoComplete="off"
            id="telegram-bot-token"
            onChange={(event) => setTelegramBotToken(event.target.value)}
            placeholder="Bot token from @BotFather"
            type="password"
            value={telegramBotToken}
          />
          <p className="text-xs leading-5 text-app-muted">
            Need a token? Open @BotFather, run /newbot or /token, then paste it here.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={!telegramBotToken.trim() || isLoadingToken || isSaving}
            onClick={() => {
              void handleSaveToken();
            }}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save token'}
          </Button>
          <Button
            onClick={handleOpenBotFather}
            type="button"
            variant="outline"
          >
            Open BotFather
            <ArrowUpRight className="h-4 w-4" />
          </Button>
          <Button
            disabled={(!telegramState.configured && !telegramBotToken.trim()) || isSaving}
            onClick={() => {
              void handleRemoveToken();
            }}
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>

        {feedback ? (
          <p
            className={`mt-3 text-sm leading-6 ${
              feedback.kind === 'error' ? 'text-red-600' : 'text-app-muted'
            }`}
          >
            {feedback.message}
          </p>
        ) : telegramState.errorMessage ? (
          <p className="mt-3 text-sm leading-6 text-red-600">
            {telegramState.errorMessage}
          </p>
        ) : null}

        {telegramBotHandle ? (
          <div className="mt-6 rounded-[20px] border border-app-border bg-app-panel/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-app-text">Connected bot</h4>
                <p className="mt-1 text-sm leading-6 text-app-muted">{telegramBotHandle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleOpenTelegramBot}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Open bot
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => {
                    void handleCopyTelegramBot();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Copy {telegramBotHandle}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-[20px] border border-app-border bg-app-panel/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-app-text">Chats discovered by this bot</h4>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                Chats appear here when the connected Telegram bot receives a message.
              </p>
            </div>
            {telegramState.discoveredChats.length > 0 ? (
              <Button
                disabled={!canRefreshChats}
                onClick={() => {
                  void handleRefreshChats();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCcw className="h-4 w-4" />
                {isRefreshing ? 'Refreshing…' : 'Refresh chats'}
              </Button>
            ) : null}
          </div>

          {telegramState.discoveredChats.length === 0 ? (
            <div className="mt-4 space-y-4">
              <div>
                <h5 className="text-sm font-semibold text-app-text">No chats discovered yet</h5>
                <div className="mt-2 space-y-2 text-sm leading-6 text-app-muted">
                  <p>
                    {telegramBotHandle
                      ? `Open ${telegramBotHandle} in Telegram and send any message, like "hi".`
                      : 'Open Telegram and message the bot you just connected.'}
                  </p>
                  <p>
                    {telegramBotHandle
                      ? `To use a group, add ${telegramBotHandle} there and send a message that mentions it, like "${telegramBotHandle} hi".`
                      : 'To use a group, add the connected bot there and send a message that mentions it once.'}
                  </p>
                  <p>This list updates automatically as soon as the bot receives the message.</p>
                  <p>If you sent the message before Dune connected, click Refresh chats.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={!canRefreshChats}
                  onClick={() => {
                    void handleRefreshChats();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {isRefreshing ? 'Refreshing…' : 'Refresh chats'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {telegramState.discoveredChats.map((chat) => {
                const isBound = boundTelegramChatIds.has(chat.jid);

                return (
                  <div
                    className="flex items-center justify-between gap-4 rounded-[16px] border border-app-border bg-app-card/70 px-4 py-3"
                    key={chat.jid}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-app-text">{chat.name}</div>
                      <p className="mt-1 text-xs leading-5 text-app-muted">
                        {chat.kind === 'group' ? 'Group' : 'DM'}
                      </p>
                    </div>
                    <span className="pill-key shrink-0">
                      {isBound ? 'In use' : 'Available'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {externalChannelOptions
          .filter((channel) => channel.id !== 'telegram')
          .map((channel) => (
            <section
              className="rounded-[20px] border border-app-border bg-app-card/60 p-5"
              key={channel.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-app-text">{channel.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {channel.description}
                  </p>
                </div>
                <span className="pill-key shrink-0">Soon</span>
              </div>

              <div className="mt-4">
                <Button disabled type="button" variant="outline">
                  Configure
                </Button>
              </div>
            </section>
          ))}
      </div>
    </>
  );
}
