import { useEffect, useMemo, useState } from 'react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { syncAgentRuntimeSnapshot } from '@/renderer/features/agents/runtime/agent-runtime';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import {
  loadNetworkSettings,
  saveNetworkSettings,
  type NetworkProxyMode,
} from '@/renderer/features/settings/model/network-settings';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const STORE_NAME = 'settings';

type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

const networkModeOptions: Array<{
  detail: string;
  id: NetworkProxyMode;
  label: string;
  summary: string;
}> = [
  {
    detail: 'Dune reaches external services directly with no proxy in the path.',
    id: 'direct',
    label: 'Direct',
    summary: 'No proxy',
  },
  {
    detail: 'Dune follows the desktop and environment proxy settings already available on this machine.',
    id: 'system',
    label: 'System',
    summary: 'Use desktop/environment proxy settings',
  },
  {
    detail: 'Dune routes renderer and runtime traffic through the manual HTTP proxy you provide below.',
    id: 'manual',
    label: 'Manual',
    summary: 'Use an explicit HTTP proxy URL',
  },
];

function createSettingsStore() {
  return {
    get: async <T,>(key: string): Promise<T | null> => {
      const value = await window.duneDesktop?.storageGet?.(STORE_NAME, key);
      return (value as T | null | undefined) ?? null;
    },
    set: async <T,>(key: string, value: T) => {
      await window.duneDesktop?.storageSet?.(STORE_NAME, key, value);
    },
  };
}

function parseBypassRules(value: string) {
  return value
    .split('\n')
    .map((rule) => rule.trim())
    .filter(Boolean);
}

export function NetworkSettings(props: SettingsSectionComponentProps) {
  void props;
  const settingsStore = useMemo(() => createSettingsStore(), []);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [manualProxyUrl, setManualProxyUrl] = useState('');
  const [mode, setMode] = useState<NetworkProxyMode>('system');
  const [rawBypassRules, setRawBypassRules] = useState('');

  useEffect(() => {
    loadNetworkSettings(settingsStore)
      .then((settings) => {
        setManualProxyUrl(settings.manualProxyUrl);
        setMode(settings.mode);
        setRawBypassRules(settings.bypassRules.join('\n'));
      })
      .catch((error) => {
        setFeedback({
          kind: 'error',
          message: `Failed to load network settings. ${String(error)}`,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [settingsStore]);

  const isManualMode = mode === 'manual';
  const canSave = !isLoading && !isSaving && (!isManualMode || Boolean(manualProxyUrl.trim()));
  const selectedMode = networkModeOptions.find((option) => option.id === mode) ?? networkModeOptions[1]!;

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const savedSettings = await saveNetworkSettings(settingsStore, {
        bypassRules: parseBypassRules(rawBypassRules),
        manualProxyUrl,
        mode,
      });

      setManualProxyUrl(savedSettings.manualProxyUrl);
      setRawBypassRules(savedSettings.bypassRules.join('\n'));

      if (typeof window.duneDesktop?.applyNetworkSettings === 'function') {
        await window.duneDesktop.applyNetworkSettings();
        const latestSnapshot = await syncAgentRuntimeSnapshot('network-settings-save');
        const telegramState = latestSnapshot.externalChannels.telegram;

        if (telegramState.configured && telegramState.status === 'error' && telegramState.errorMessage) {
          setFeedback({
            kind: 'error',
            message: telegramState.errorMessage,
          });
          return;
        }
      }

      setFeedback({
        kind: 'success',
        message: 'Network settings saved. Changes apply immediately.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to save network settings. ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose how Dune reaches external services."
        eyebrow="Network"
        title="Proxy and transport"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Applies to renderer traffic and the agent runtime. Telegram reconnects immediately.
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {networkModeOptions.map((option) => {
          const isActive = option.id === mode;

          return (
            <button
              aria-pressed={isActive}
              className={cn(
                'rounded-[18px] border p-4 text-left transition-colors',
                isActive
                  ? 'border-app-accent/40 bg-app-accent-soft text-app-text'
                  : 'border-app-border bg-app-card/40 text-app-muted hover:border-app-border-strong hover:bg-app-card hover:text-app-text',
              )}
              disabled={isLoading || isSaving}
              key={option.id}
              onClick={() => setMode(option.id)}
              type="button"
            >
              <span className="text-sm font-semibold text-app-text">{option.label}</span>
              <span className="mt-1 block text-xs leading-5 text-app-muted">{option.summary}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
        {!isManualMode ? (
          <div>
            <h3 className="text-sm font-semibold text-app-text">{selectedMode.label}</h3>
            <p className="mt-2 text-sm leading-6 text-app-muted">{selectedMode.detail}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-app-text">Manual proxy</h3>
              <p className="mt-2 text-sm leading-6 text-app-muted">{selectedMode.detail}</p>
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
                htmlFor="network-proxy-url"
              >
                HTTP proxy URL
              </label>
              <Input
                disabled={isLoading}
                id="network-proxy-url"
                onChange={(event) => setManualProxyUrl(event.target.value)}
                placeholder="http://127.0.0.1:7890"
                value={manualProxyUrl}
              />
              <p className="text-sm text-app-muted">
                Manual mode accepts a single HTTP proxy URL.
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
                htmlFor="network-bypass-rules"
              >
                Bypass list
              </label>
              <textarea
                className="min-h-[124px] w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 focus-visible:ring-app-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                id="network-bypass-rules"
                onChange={(event) => setRawBypassRules(event.target.value)}
                placeholder={'localhost\n127.0.0.1\ninternal.example'}
                value={rawBypassRules}
              />
              <p className="text-sm text-app-muted">
                One host or wildcard pattern per line. Loopback traffic is bypassed automatically.
              </p>
            </div>
          </div>
        )}
      </div>

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
          onClick={handleSave}
          type="button"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
