// Coding engine settings UI.

import { useEffect, useMemo, useState } from 'react';

import type { CodingEngineStatus } from '@/renderer/features/agents/types';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  loadCodingEngineSettings,
  resolveCodingEngineSelection,
  saveCodingEngineSettings,
  SUPPORTED_CODING_ENGINES,
  type CodingEngineSettingsStore,
} from '@/shared/settings/coding-engine';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const STORE_NAME = 'settings';

/** Feedback state. */
type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

/** Creates bridge-backed settings store. */
function createSettingsStore(): CodingEngineSettingsStore {
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

/** Toggle props. */
interface CodingEngineToggleProps {
  checked: boolean;
  onToggle: () => void;
}

/** Renders the coding engine toggle UI. */
function CodingEngineToggle({ checked, onToggle }: CodingEngineToggleProps) {
  return (
    <button
      aria-checked={checked}
      aria-label="Enable coding engine"
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

/** Formats the select option label. */
function formatEngineOptionLabel(
  option: { id: string; label: string },
  engineStatusById: Map<string, CodingEngineStatus>,
) {
  const status = engineStatusById.get(option.id);

  if (!status) {
    return option.label;
  }

  if (!status.available) {
    return `${option.label} · Not found`;
  }

  return `${option.label} · ${status.version ?? 'Detected'}`;
}

/** Renders the coding engine settings UI. */
export function CodingEngineSettings({
  codingEngines,
}: SettingsSectionComponentProps) {
  const settingsStore = useMemo(() => createSettingsStore(), []);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [selectedEngine, setSelectedEngine] = useState(SUPPORTED_CODING_ENGINES[0]?.id ?? 'claude-code');
  const availableEngineIds = useMemo(
    () => codingEngines
      .filter((engine) => engine.available)
      .map((engine) => engine.id),
    [codingEngines],
  );
  const engineStatusById = useMemo(
    () => new Map(codingEngines.map((engine) => [engine.id, engine])),
    [codingEngines],
  );
  const selectedEngineStatus = engineStatusById.get(selectedEngine);

  useEffect(() => {
    let cancelled = false;

    loadCodingEngineSettings(settingsStore)
      .then((settings) => {
        if (cancelled) {
          return;
        }

        setEnabled(settings.enabled);
        setSelectedEngine(
          settings.selectedEngine
            ?? resolveCodingEngineSelection(
              { enabled: true, selectedEngine: null },
              availableEngineIds,
            )
            ?? SUPPORTED_CODING_ENGINES[0]?.id
            ?? 'claude-code',
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setFeedback({
          kind: 'error',
          message: `Failed to load coding engine settings. ${String(error)}`,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [availableEngineIds, settingsStore]);

  const canSave = !isLoading && !isSaving && (!enabled || Boolean(selectedEngine));

  /** Handles toggle. */
  const handleToggle = () => {
    const nextEnabled = !enabled;

    setEnabled(nextEnabled);
    setFeedback(null);

    if (nextEnabled && !selectedEngine) {
      setSelectedEngine(
        resolveCodingEngineSelection(
          { enabled: true, selectedEngine: null },
          availableEngineIds,
        ) ?? SUPPORTED_CODING_ENGINES[0]?.id ?? 'claude-code',
      );
    }
  };

  /** Handles save. */
  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const persistedSettings = await saveCodingEngineSettings(
        settingsStore,
        {
          enabled,
          selectedEngine,
        },
        availableEngineIds,
      );

      setEnabled(persistedSettings.enabled);
      setSelectedEngine(
        persistedSettings.selectedEngine
          ?? SUPPORTED_CODING_ENGINES[0]?.id
          ?? 'claude-code',
      );
      setFeedback({
        kind: 'success',
        message: persistedSettings.enabled
          ? 'Coding engine settings saved. Restart Dune to reconfigure already running agents.'
          : 'Coding engine delegation disabled. Restart Dune to remove it from already running agents.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to save coding engine settings. ${String(error)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose whether agents can delegate ACP work to a coding engine, and which engine Dune should target."
        eyebrow="Coding Engine"
        title="Delegation"
      />

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-card/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-app-text">Coding Engine</h3>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              Turn ACP coding-engine delegation on or off for Dune agents.
            </p>
          </div>
          <CodingEngineToggle checked={enabled} onToggle={handleToggle} />
        </div>
      </section>

      {enabled ? (
        <section className="mt-4 rounded-[20px] border border-app-border bg-app-panel/40 p-5">
          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
              htmlFor="coding-engine-select"
            >
              Engine
            </label>
            <select
              className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isSaving}
              id="coding-engine-select"
              onChange={(event) => setSelectedEngine(event.target.value as typeof selectedEngine)}
              value={selectedEngine}
            >
              {SUPPORTED_CODING_ENGINES.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {formatEngineOptionLabel(engine, engineStatusById)}
                </option>
              ))}
            </select>
            <p className="text-sm text-app-muted">
              {selectedEngineStatus?.available
                ? `${selectedEngineStatus.label} is available on PATH and will be used for ACP delegation.`
                : 'The selected engine is not currently detected on PATH. Save anyway or choose a detected engine.'}
            </p>
          </div>
        </section>
      ) : null}

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
        <Button disabled={!canSave} onClick={handleSave} type="button">
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
