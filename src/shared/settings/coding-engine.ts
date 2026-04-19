// Coding engine settings persistence helpers.

import type { CodingEngineId } from '@/renderer/features/agents/types';
import { isPlainObject } from '@/shared/is-record';

/** Storage key for coding engine settings. */
export const CODING_ENGINE_SETTINGS_KEY = 'codingEngine';

/** Supported coding engine option. */
export interface SupportedCodingEngine {
  id: CodingEngineId;
  label: string;
}

/** Persisted coding engine settings. */
export interface CodingEngineSettings {
  enabled: boolean;
  selectedEngine: CodingEngineId | null;
}

/** Coding engine settings store contract. */
export interface CodingEngineSettingsStore {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T) => Promise<void>;
}

/** Supported coding engine options. */
export const SUPPORTED_CODING_ENGINES: SupportedCodingEngine[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
  },
  {
    id: 'codex',
    label: 'Codex',
  },
];

/** Default coding engine settings. */
export const DEFAULT_CODING_ENGINE_SETTINGS: CodingEngineSettings = {
  enabled: true,
  selectedEngine: null,
};

const SUPPORTED_CODING_ENGINE_IDS = new Set<CodingEngineId>(
  SUPPORTED_CODING_ENGINES.map((engine) => engine.id),
);

/** Returns whether the value is a known coding engine ID. */
export function isCodingEngineId(value: unknown): value is CodingEngineId {
  return typeof value === 'string'
    && SUPPORTED_CODING_ENGINE_IDS.has(value as CodingEngineId);
}

/** Normalizes coding engine settings. */
export function normalizeCodingEngineSettings(value: unknown): CodingEngineSettings {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_CODING_ENGINE_SETTINGS };
  }

  return {
    enabled: typeof value.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_CODING_ENGINE_SETTINGS.enabled,
    selectedEngine: isCodingEngineId(value.selectedEngine)
      ? value.selectedEngine
      : DEFAULT_CODING_ENGINE_SETTINGS.selectedEngine,
  };
}

/** Resolves the preferred coding engine selection. */
export function resolveCodingEngineSelection(
  settings: CodingEngineSettings,
  availableEngineIds: CodingEngineId[] = [],
) {
  if (!settings.enabled) {
    return null;
  }

  if (settings.selectedEngine) {
    return settings.selectedEngine;
  }

  if (availableEngineIds.length > 0) {
    return availableEngineIds[0] ?? null;
  }

  return SUPPORTED_CODING_ENGINES[0]?.id ?? null;
}

/** Loads coding engine settings. */
export async function loadCodingEngineSettings(
  settingsStore: CodingEngineSettingsStore,
) {
  const value = await settingsStore.get<unknown>(CODING_ENGINE_SETTINGS_KEY);
  return normalizeCodingEngineSettings(value);
}

/** Saves coding engine settings. */
export async function saveCodingEngineSettings(
  settingsStore: CodingEngineSettingsStore,
  settings: CodingEngineSettings,
  availableEngineIds: CodingEngineId[] = [],
) {
  const normalized = normalizeCodingEngineSettings(settings);
  const selectedEngine = normalized.selectedEngine
    ?? resolveCodingEngineSelection(
      { enabled: true, selectedEngine: null },
      availableEngineIds,
    );
  const persistedSettings: CodingEngineSettings = {
    enabled: normalized.enabled,
    selectedEngine,
  };

  await settingsStore.set(CODING_ENGINE_SETTINGS_KEY, persistedSettings);

  return persistedSettings;
}
