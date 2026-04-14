// Telegram channel setup card UI.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Copy, RefreshCw } from 'lucide-react';

import { syncAgentRuntimeSnapshot } from '@/renderer/features/agents/runtime/agent-runtime';
import type {
  Agent,
  TelegramConnectionStatus,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

const BOTFATHER_URL = 'https://t.me/BotFather';

/** Feedback state. */
type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

/** Wizard step shape. */
type WizardStep = 'botfather' | 'pairing' | 'summary' | 'token';

/** Telegram channel setup card props. */
interface TelegramChannelSetupCardProps {
  agent?: Agent | null;
  onSessionChange?: (session: TelegramSetupSession | null) => void;
}

/** Telegrams status label. */
function telegramStatusLabel(status: TelegramConnectionStatus) {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Error';
    case 'not-configured':
      return 'Not configured';
    default:
      return 'Disconnected';
  }
}

/** Formats pairing countdown. */
function formatPairingCountdown(pairExpiresAt: number | null, now: number) {
  if (!pairExpiresAt) {
    return null;
  }

  const remainingMs = Math.max(0, pairExpiresAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Derives initial step. */
function deriveInitialStep(agent: Agent | null | undefined) {
  if (!agent || agent.channel.id !== 'telegram') {
    return 'botfather' as const;
  }

  return 'summary' as const;
}

/** Renders the Telegram channel setup card UI. */
export function TelegramChannelSetupCard({
  agent = null,
  onSessionChange,
}: TelegramChannelSetupCardProps) {
  const telegramSetupSessions = useAppStore((state) => state.telegramSetupSessions);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSaving, setSaving] = useState(false);
  const [isPairCommandCopied, setPairCommandCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>(() => deriveInitialStep(agent));
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const copyResetTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const ownedSessionIdRef = useRef<string | null>(null);
  const isInspector = agent?.channel.id === 'telegram';
  const activeSession = useMemo(() => {
    if (sessionId) {
      return telegramSetupSessions.find((session) => session.id === sessionId) ?? null;
    }

    if (isInspector && agent) {
      return telegramSetupSessions.find((session) => session.agentId === agent.id) ?? null;
    }

    return null;
  }, [agent, isInspector, sessionId, telegramSetupSessions]);
  const pairCommand = activeSession?.pairCode ? `/pair ${activeSession.pairCode}` : null;
  const pairingCountdown = formatPairingCountdown(activeSession?.pairExpiresAt ?? null, now);
  const status = activeSession?.status ?? agent?.telegram?.status ?? 'not-configured';

  useEffect(() => {
    setStep(deriveInitialStep(agent));
  }, [agent?.id, agent?.channel.id]);

  useEffect(() => {
    if (activeSession && step !== 'pairing') {
      setStep('pairing');
    }
  }, [activeSession, step]);

  useEffect(() => {
    if (activeSession && !sessionId) {
      setSessionId(activeSession.id);
      ownedSessionIdRef.current = activeSession.id;
    }
  }, [activeSession, sessionId]);

  useEffect(() => {
    if (typeof onSessionChange === 'function') {
      onSessionChange(activeSession);
    }
  }, [activeSession, onSessionChange]);

  useEffect(() => {
    if (activeSession?.pairingStatus !== 'listening') {
      return undefined;
    }

    const intervalId = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [activeSession?.pairingStatus]);

  useEffect(() => {
    setPairCommandCopied(false);
    if (copyResetTimeoutRef.current) {
      globalThis.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, [pairCommand]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        globalThis.clearTimeout(copyResetTimeoutRef.current);
      }

      const currentSessionId = ownedSessionIdRef.current;

      if (
        currentSessionId
        && typeof window.duneDesktop?.cancelTelegramSetupSession === 'function'
      ) {
        void window.duneDesktop.cancelTelegramSetupSession(currentSessionId);
      }
    };
  }, []);

  /** Synchronizes snapshot. */
  const syncSnapshot = async (reason: string) => {
    return syncAgentRuntimeSnapshot(reason);
  };

  /** Starts setup session. */
  const startSetupSession = async (options: {
    reason: string;
    token?: string;
  }) => {
    if (typeof window.duneDesktop?.startTelegramSetupSession !== 'function') {
      setFeedback({
        kind: 'error',
        message: 'Runtime is still starting. Try again in a moment.',
      });
      return null;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const nextSessionId = await window.duneDesktop.startTelegramSetupSession({
        ...(agent ? { agentId: agent.id } : {}),
        ...(options.token?.trim() ? { token: options.token.trim() } : {}),
      });

      ownedSessionIdRef.current = nextSessionId;
      setSessionId(nextSessionId);
      setStep('pairing');
      await syncSnapshot(options.reason);
      return nextSessionId;
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to start Telegram setup. ${String(error)}`,
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** Handles token save. */
  const handleSaveToken = async () => {
    const token = telegramBotToken.trim();

    if (!token) {
      return;
    }

    const nextSessionId = await startSetupSession({
      reason: 'telegram-channel-setup-save-token',
      token,
    });

    if (nextSessionId) {
      setFeedback({
        kind: 'success',
        message: isInspector
          ? 'Telegram bot token saved for this agent. Pair the target chat now.'
          : 'Telegram bot token saved. Pair the target chat now.',
      });
    }
  };

  /** Handles with existing agent token start. */
  const handleStartWithExistingAgentToken = async () => {
    const nextSessionId = await startSetupSession({
      reason: 'telegram-channel-setup-existing-token',
    });

    if (nextSessionId) {
      setFeedback(null);
    }
  };

  /** Handles session cancel. */
  const handleCancelSession = async (nextStep: WizardStep) => {
    if (!sessionId || typeof window.duneDesktop?.cancelTelegramSetupSession !== 'function') {
      setStep(nextStep);
      return;
    }

    try {
      await window.duneDesktop.cancelTelegramSetupSession(sessionId);
      ownedSessionIdRef.current = null;
      setSessionId(null);
      await syncSnapshot('telegram-channel-setup-cancel');
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to cancel Telegram setup. ${String(error)}`,
      });
    }

    setStep(nextStep);
  };

  /** Handles bot father opening. */
  const handleOpenBotFather = () => {
    if (typeof window.duneDesktop?.openExternal === 'function') {
      void window.duneDesktop.openExternal(BOTFATHER_URL);
      return;
    }

    window.open(BOTFATHER_URL, '_blank', 'noopener,noreferrer');
  };

  /** Handles pair command copy. */
  const handleCopyPairCommand = async () => {
    if (!pairCommand) {
      return;
    }

    setPairCommandCopied(true);
    if (copyResetTimeoutRef.current) {
      globalThis.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = globalThis.setTimeout(() => {
      setPairCommandCopied(false);
      copyResetTimeoutRef.current = null;
    }, 2000);

    try {
      if (typeof window.duneDesktop?.copyText === 'function') {
        await window.duneDesktop.copyText(pairCommand);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairCommand);
      } else {
        throw new Error('Clipboard is unavailable.');
      }
    } catch (error) {
      setPairCommandCopied(false);
      if (copyResetTimeoutRef.current) {
        globalThis.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
      setFeedback({
        kind: 'error',
        message: `Failed to copy pair command. ${String(error)}`,
      });
    }
  };

  return (
    <section
      className="rounded-[18px] border border-app-border bg-app-card/50 p-4"
      data-testid="telegram-settings-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-app-text">
            {isInspector ? 'Telegram channel' : 'Telegram setup'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            {isInspector
              ? 'This Telegram bot and chat binding belong to this agent only.'
              : 'Create a bot, paste its token, and claim one chat with a one-time pair code.'}
          </p>
        </div>
        <span className="pill-key shrink-0">
          {telegramStatusLabel(status)}
        </span>
      </div>

      <div className="mt-5" data-testid={`telegram-wizard-step-${step}`}>
        {step === 'summary' ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-app-border bg-app-panel/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                Telegram
              </div>
              <h4 className="mt-3 text-sm font-semibold text-app-text">Current binding</h4>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                {agent?.channel.target
                  ? `${agent.channel.target.name} is currently attached to this agent.`
                  : 'This agent does not have a confirmed Telegram chat yet.'}
              </p>
              {agent?.channel.target ? (
                <p className="mt-3 text-xs leading-5 text-app-muted">
                  {agent.channel.target.kind === 'group' ? 'Group' : 'DM'} · {agent.channel.target.jid}
                </p>
              ) : null}
              {agent?.telegram?.botUsername ? (
                <p className="mt-3 text-xs leading-5 text-app-muted">
                  Bot: @{agent.telegram.botUsername}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={isSaving}
                onClick={() => {
                  void handleStartWithExistingAgentToken();
                }}
                type="button"
              >
                Re-pair chat
              </Button>
              <Button
                onClick={() => {
                  setTelegramBotToken('');
                  setStep('token');
                }}
                type="button"
                variant="quiet"
              >
                Change bot token
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'botfather' ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-app-border bg-app-panel/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                Step 1
              </div>
              <h4 className="mt-3 text-sm font-semibold text-app-text">Open BotFather</h4>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                Create a Telegram bot with <span className="font-medium text-app-text">@BotFather</span>,
                or reuse an existing bot if you already have a token.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleOpenBotFather} type="button">
                Open BotFather
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => setStep('token')} type="button" variant="quiet">
                I already have a token
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'token' ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-app-border bg-app-panel/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                {isInspector ? 'Bot token' : 'Step 2'}
              </div>
              <h4 className="mt-3 text-sm font-semibold text-app-text">Paste bot token</h4>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                This token is stored for this agent only. After saving it, Dune starts listening for the pair code automatically.
              </p>

              <div className="mt-4 space-y-2">
                <label
                  className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                  htmlFor={`telegram-bot-token-${agent?.id ?? 'draft'}`}
                >
                  Bot token
                </label>
                <Input
                  autoComplete="off"
                  id={`telegram-bot-token-${agent?.id ?? 'draft'}`}
                  onChange={(event) => setTelegramBotToken(event.target.value)}
                  placeholder="Bot token from @BotFather"
                  type="password"
                  value={telegramBotToken}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  setStep(isInspector ? 'summary' : 'botfather');
                }}
                type="button"
                variant="quiet"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                disabled={!telegramBotToken.trim() || isSaving}
                onClick={() => {
                  void handleSaveToken();
                }}
                type="button"
              >
                {isSaving ? 'Saving…' : 'Save token'}
              </Button>
              {isInspector ? (
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void handleStartWithExistingAgentToken();
                  }}
                  type="button"
                  variant="ghost"
                >
                  Use current token
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'pairing' ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-app-border bg-app-panel/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                {isInspector ? 'Pairing' : 'Step 3'}
              </div>
              <h4 className="mt-3 text-sm font-semibold text-app-text">Pair code</h4>

              {activeSession?.pairingStatus === 'matched' && activeSession.matchedChat ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {isInspector
                      ? 'This agent is now bound to the Telegram chat that claimed the pair code.'
                      : 'Dune found the Telegram chat that claimed this code. You can create the agent now.'}
                  </p>
                  <div className="mt-4 rounded-[16px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-app-text">
                      <Check className="h-4 w-4 text-emerald-600" />
                      Pairing confirmed
                    </div>
                    <div className="mt-2 text-sm text-app-text">
                      {activeSession.matchedChat.name}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-app-muted">
                      {activeSession.matchedChat.kind === 'group' ? 'Group' : 'DM'} · {activeSession.matchedChat.jid}
                    </p>
                  </div>
                </>
              ) : activeSession?.pairingStatus === 'expired' ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    The last pair code expired before any Telegram chat claimed it.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-app-muted">
                    Generate a new code, then send it in the target Telegram chat.
                  </p>
                </>
              ) : !pairCommand ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    Dune is connecting the Telegram bot and preparing a fresh pair code.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-app-muted">
                    Keep this screen open. The pair command appears here as soon as the session is ready.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    Send the exact command below from the Telegram chat you want to attach.
                  </p>
                  <button
                    className="focus-ring-app mt-4 block w-full rounded-[16px] border border-app-border bg-app-card/70 px-4 py-3 text-left transition-colors hover:bg-app-card"
                    onClick={() => {
                      void handleCopyPairCommand();
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                          <span>Pair command</span>
                          {isPairCommandCopied ? (
                            <span className="text-emerald-600">Copied</span>
                          ) : null}
                        </div>
                        <div className="mt-2 font-mono text-base font-semibold text-app-text">
                          {pairCommand}
                        </div>
                      </div>
                      {isPairCommandCopied ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-app-muted">
                      {isPairCommandCopied
                        ? 'Copied to clipboard.'
                        : pairingCountdown
                          ? `Expires in ${pairingCountdown}. Click to copy.`
                          : 'Waiting for a Telegram chat to claim this code. Click to copy.'}
                    </p>
                  </button>
                  <div className="mt-4 space-y-2 text-sm leading-6 text-app-muted">
                    <p>The first Telegram chat that sends this exact pair command will be matched automatically.</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  void handleCancelSession(isInspector ? 'summary' : 'token');
                }}
                type="button"
                variant="quiet"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              {activeSession?.pairingStatus !== 'matched' ? (
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    void startSetupSession({
                      reason: 'telegram-channel-setup-regenerate',
                      ...(telegramBotToken.trim() ? { token: telegramBotToken.trim() } : {}),
                    });
                  }}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isSaving ? 'Generating…' : 'Generate new code'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {feedback ? (
        <p
          className={`mt-4 text-sm leading-6 ${
            feedback.kind === 'error' ? 'text-red-600' : 'text-app-muted'
          }`}
        >
          {feedback.message}
        </p>
      ) : activeSession?.errorMessage ? (
        <p className="mt-4 text-sm leading-6 text-red-600">
          {activeSession.errorMessage}
        </p>
      ) : agent?.telegram?.errorMessage ? (
        <p className="mt-4 text-sm leading-6 text-red-600">
          {agent.telegram.errorMessage}
        </p>
      ) : null}
    </section>
  );
}
