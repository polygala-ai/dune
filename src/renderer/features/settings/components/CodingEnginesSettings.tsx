// Coding engines settings UI.

import { useEffect, useState } from 'react';

import type { CodingEngineId, CodingEngineStatus } from '@/renderer/features/agents/types';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import {
  codingEngineIds,
  isCodingEngineEnabled,
  type CodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const codingEngineCopy: Record<CodingEngineId, {
  description: string;
  label: string;
}> = {
  'claude-code': {
    description: 'Anthropic peer for delegated coding work.',
    label: 'Claude Code',
  },
  codex: {
    description: 'OpenAI peer for delegated coding work.',
    label: 'Codex',
  },
};

/** Builds enabled map. */
function createEnabledMap(settings: CodingEngineSettings): Record<CodingEngineId, boolean> {
  return Object.fromEntries(
    codingEngineIds.map((engineId) => [engineId, isCodingEngineEnabled(settings, engineId)]),
  ) as Record<CodingEngineId, boolean>;
}

/** Builds settings from enabled map. */
function createSettingsFromEnabledMap(
  enabledMap: Record<CodingEngineId, boolean>,
  currentSettings: CodingEngineSettings,
): CodingEngineSettings {
  return {
    backendModel: currentSettings.backendModel,
    backendType: currentSettings.backendType,
    enabledEngineIds: codingEngineIds.filter((engineId) => enabledMap[engineId]),
  };
}

/** Returns whether enabled maps match. */
function enabledMapsMatch(
  left: Record<CodingEngineId, boolean>,
  right: Record<CodingEngineId, boolean>,
) {
  return codingEngineIds.every((engineId) => left[engineId] === right[engineId]);
}

/** Engine toggle props. */
interface EngineToggleProps {
  checked: boolean;
  engineLabel: string;
  onToggle: () => void;
}

/** Renders engine toggle. */
function EngineToggle({
  checked,
  engineLabel,
  onToggle,
}: EngineToggleProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={`Enable ${engineLabel}`}
      className={cn(
        'focus-ring-app inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2',
        checked
          ? 'border-app-accent/40 bg-app-accent/12 text-app-text'
          : 'border-app-border bg-app-panel text-app-muted hover:border-app-border-strong hover:text-app-text',
      )}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span>{checked ? 'Enabled' : 'Disabled'}</span>
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
  );
}

/** Returns status copy for an engine. */
function getStatusCopy(
  status: CodingEngineStatus | undefined,
  runtimeStatus: SettingsSectionComponentProps['runtimeInfo']['status'],
) {
  if (!status) {
    return runtimeStatus === 'starting'
      ? 'Checking the local CLI…'
      : 'Waiting for runtime detection.';
  }

  if (status.available) {
    return status.version ? `Installed · ${status.version}` : 'Installed';
  }

  return 'Not installed';
}

/** Renders the coding engines settings UI. */
export function CodingEnginesSettings({
  codingEngines,
  runtimeInfo,
}: SettingsSectionComponentProps) {
  const [draftEnabledMap, setDraftEnabledMap] = useState<Record<CodingEngineId, boolean>>(
    createEnabledMap({
      backendModel: '',
      backendType: 'claudeCode',
      enabledEngineIds: [...codingEngineIds],
    }),
  );
  const [savedEnabledMap, setSavedEnabledMap] = useState<Record<CodingEngineId, boolean>>(
    createEnabledMap({
      backendModel: '',
      backendType: 'claudeCode',
      enabledEngineIds: [...codingEngineIds],
    }),
  );
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [isRestartDialogOpen, setRestartDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const codingEngineStatuses = new Map(codingEngines.map((engine) => [engine.id, engine] as const));

  useEffect(() => {
    window.duneDesktop?.loadCodingEngineSettings?.()
      .then((settings) => {
        if (!settings) {
          throw new Error('Desktop settings API is unavailable.');
        }
        const enabledMap = createEnabledMap(settings);
        setDraftEnabledMap(enabledMap);
        setSavedEnabledMap(enabledMap);
      })
      .catch((error) => {
        setErrorMessage(`Failed to load coding engine settings. ${String(error)}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const canSave = !isLoading &&
    !isSaving &&
    !enabledMapsMatch(draftEnabledMap, savedEnabledMap);

  /** Handles save. */
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);

    try {
      const currentSettings = await window.duneDesktop?.loadCodingEngineSettings?.();
      if (!currentSettings) {
        throw new Error('Desktop settings API is unavailable.');
      }
      const savedSettings = await window.duneDesktop?.saveCodingEngineSettings?.(
        createSettingsFromEnabledMap(draftEnabledMap, currentSettings),
      );
      if (!savedSettings) {
        throw new Error('Desktop settings API is unavailable.');
      }
      const enabledMap = createEnabledMap(savedSettings);
      setDraftEnabledMap(enabledMap);
      setSavedEnabledMap(enabledMap);

      if (typeof window.duneDesktop?.restartApp === 'function') {
        setRestartDialogOpen(true);
      }
    } catch (error) {
      setErrorMessage(`Failed to save coding engine settings. ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose which delegated coding peers Dune exposes to agents."
        eyebrow="Engines"
        title="Coding engines"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Changes apply after restart so existing agent runtimes keep a stable peer list.
      </div>

      <div className="mt-6 space-y-3">
        {codingEngineIds.map((engineId) => {
          const engine = codingEngineStatuses.get(engineId);
          const copy = codingEngineCopy[engineId];

          return (
            <section
              className="rounded-[20px] border border-app-border bg-app-card/60 p-5"
              data-testid={`coding-engine-card-${engineId}`}
              key={engineId}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-app-text">{copy.label}</h3>
                    <span className="pill-key shrink-0">
                      {getStatusCopy(engine, runtimeInfo.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {copy.description}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">
                    {engine?.available
                      ? 'Available on this machine now.'
                      : 'Keep it enabled if you want Dune to pick it up automatically after the CLI is installed.'}
                  </p>
                </div>

                <EngineToggle
                  checked={draftEnabledMap[engineId]}
                  engineLabel={copy.label}
                  onToggle={() => {
                    setDraftEnabledMap((current) => ({
                      ...current,
                      [engineId]: !current[engineId],
                    }));
                  }}
                />
              </div>
            </section>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button
          disabled={!canSave}
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <Dialog open={isRestartDialogOpen}>
        <DialogContent
          className="w-[min(92vw,520px)]"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle>Restart to apply coding engine changes</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            Your coding engine preferences have been saved. Restart the app to apply them to
            existing agent runtimes.
          </DialogDescription>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              onClick={() => setRestartDialogOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void window.duneDesktop?.restartApp?.();
              }}
              type="button"
            >
              Restart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
