// Agent backend settings UI.

import { useEffect, useState } from 'react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import {
  agentLiteBackendTypes,
  getAgentLiteBackendType,
  type AgentLiteBackendType,
  type CodingEngineSettings,
} from '@/renderer/features/settings/model/coding-engine-settings';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const backendCopy: Record<AgentLiteBackendType, {
  description: string;
  label: string;
}> = {
  claudeCode: {
    description: 'Run each AgentLite turn through Claude Code inside the container.',
    label: 'Claude Code',
  },
  codex: {
    description: 'Run each AgentLite turn through Codex inside the container.',
    label: 'Codex',
  },
};

const backendModelOptions: Record<AgentLiteBackendType, string[]> = {
  claudeCode: ['claude-sonnet-4-6'],
  codex: ['gpt-5.4'],
};

/** Returns selectable models, preserving a saved custom value if present. */
function getBackendModelOptions(backendType: AgentLiteBackendType, currentModel: string) {
  const normalizedModel = currentModel.trim();
  const options = backendModelOptions[backendType];
  if (!normalizedModel || options.includes(normalizedModel)) {
    return options;
  }
  return [...options, normalizedModel];
}

/** Builds settings with selected backend options while preserving engine preferences. */
function createSettingsFromBackendOptions(
  currentSettings: CodingEngineSettings,
  backendType: AgentLiteBackendType,
  backendModel: string,
): CodingEngineSettings {
  return {
    ...currentSettings,
    backendModel: backendModel.trim(),
    backendType,
  };
}

/** Renders the agent backend settings UI. */
export function AgentBackendSettings(props: SettingsSectionComponentProps) {
  void props;

  const [draftBackendModel, setDraftBackendModel] = useState('');
  const [draftBackendType, setDraftBackendType] = useState<AgentLiteBackendType>('claudeCode');
  const [savedBackendModel, setSavedBackendModel] = useState('');
  const [savedBackendType, setSavedBackendType] = useState<AgentLiteBackendType>('claudeCode');
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    window.duneDesktop?.loadCodingEngineSettings?.()
      .then((settings) => {
        if (!settings) {
          throw new Error('Desktop settings API is unavailable.');
        }
        const backendType = getAgentLiteBackendType(settings);
        setDraftBackendModel(settings.backendModel);
        setDraftBackendType(backendType);
        setSavedBackendModel(settings.backendModel);
        setSavedBackendType(backendType);
      })
      .catch((error) => {
        setErrorMessage(`Failed to load agent backend settings. ${String(error)}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const canSave = !isLoading &&
    !isSaving &&
    (
      draftBackendType !== savedBackendType ||
      draftBackendModel.trim() !== savedBackendModel
    );

  /** Handles save. */
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);

    try {
      const currentSettings = await window.duneDesktop?.loadCodingEngineSettings?.();
      if (!currentSettings) {
        throw new Error('Desktop settings API is unavailable.');
      }
      const savedSettings = await window.duneDesktop?.saveCodingEngineSettings?.(
        createSettingsFromBackendOptions(currentSettings, draftBackendType, draftBackendModel),
      );
      if (!savedSettings) {
        throw new Error('Desktop settings API is unavailable.');
      }
      const backendType = getAgentLiteBackendType(savedSettings);
      setDraftBackendModel(savedSettings.backendModel);
      setDraftBackendType(backendType);
      setSavedBackendModel(savedSettings.backendModel);
      setSavedBackendType(backendType);
      setSavedMessage('Backend settings saved. The new backend and model apply on the next agent turn.');
    } catch (error) {
      setErrorMessage(`Failed to save agent backend settings. ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Choose the primary AgentLite backend that handles each agent turn."
        eyebrow="Backend"
        title="Agent backend"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Changes apply on the next agent turn. A running turn continues with the backend it started on.
      </div>

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-card/60 p-5">
        <div
          aria-label="AgentLite backend"
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
        >
          {agentLiteBackendTypes.map((backendType) => {
            const copy = backendCopy[backendType];
            const selected = draftBackendType === backendType;

            return (
              <label
                className={cn(
                  'min-h-24 cursor-pointer rounded-[16px] border px-4 py-3 text-left transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-app-accent',
                  selected
                    ? 'border-app-accent/50 bg-app-accent/12 text-app-text'
                    : 'border-app-border bg-app-panel/60 text-app-muted hover:border-app-border-strong hover:text-app-text',
                )}
                key={backendType}
              >
                <input
                  aria-label={`Use ${copy.label} backend`}
                  checked={selected}
                  className="sr-only"
                  name="agent-backend"
                  onChange={() => {
                    setDraftBackendType(backendType);
                    setDraftBackendModel('');
                    setSavedMessage(null);
                  }}
                  type="radio"
                  value={backendType}
                />
                <span className="block text-sm font-semibold">{copy.label}</span>
                <span className="mt-2 block text-xs leading-5">{copy.description}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-5">
          <label
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-app-muted"
            htmlFor="agent-backend-model"
          >
            Model
          </label>
          <select
            aria-label="Backend model"
            className="focus-ring-app flex h-11 w-full appearance-none rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            id="agent-backend-model"
            onChange={(event) => {
              setDraftBackendModel(event.target.value);
              setSavedMessage(null);
            }}
            value={draftBackendModel}
          >
            <option value="">Backend default</option>
            {getBackendModelOptions(draftBackendType, draftBackendModel).map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
      </section>

      {errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {savedMessage ? (
        <div className="mt-4 rounded-[18px] border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {savedMessage}
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
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
