// Coding engine settings persistence helpers.

import type { CodingEngineId } from '@/renderer/features/agents/types';
import type { AgentBackendOptions } from '@boxlite-ai/agentlite';

/** Storage key for coding engine settings. */
export const CODING_ENGINE_SETTINGS_KEY = 'codingEngineSettings';

/** Known coding engine IDs. */
export const codingEngineIds: CodingEngineId[] = ['claude-code', 'codex'];

/** AgentLite primary backend identifiers. */
export const agentLiteBackendTypes = ['claudeCode', 'codex'] as const;

/** AgentLite primary backend shape. */
export type AgentLiteBackendType = (typeof agentLiteBackendTypes)[number];

/** Coding engine settings. */
export interface CodingEngineSettings {
  backendModel: string;
  backendType: AgentLiteBackendType;
  enabledEngineIds: CodingEngineId[];
}

/** Coding engine settings store contract. */
export interface CodingEngineSettingsStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

/** Creates default coding engine settings. */
export function createDefaultCodingEngineSettings(): CodingEngineSettings {
  return {
    backendModel: '',
    backendType: 'claudeCode',
    enabledEngineIds: [...codingEngineIds],
  };
}

/** Returns whether value is a known AgentLite backend type. */
function isAgentLiteBackendType(value: unknown): value is AgentLiteBackendType {
  return agentLiteBackendTypes.some((backendType) => backendType === value);
}

/** Normalizes coding engine settings. */
export function normalizeCodingEngineSettings(value: unknown): CodingEngineSettings {
  if (!value || typeof value !== 'object') {
    return createDefaultCodingEngineSettings();
  }

  const rawBackendType = (value as { backendType?: unknown }).backendType;
  const rawBackendModel = (value as { backendModel?: unknown }).backendModel;
  const rawEnabledEngineIds = (value as { enabledEngineIds?: unknown }).enabledEngineIds;
  const backendType = isAgentLiteBackendType(rawBackendType) ? rawBackendType : 'claudeCode';
  const backendModel = typeof rawBackendModel === 'string' ? rawBackendModel.trim() : '';

  if (!Array.isArray(rawEnabledEngineIds)) {
    return {
      backendModel,
      backendType,
      enabledEngineIds: [...codingEngineIds],
    };
  }

  const enabledEngineIds = codingEngineIds.filter((engineId) =>
    rawEnabledEngineIds.includes(engineId),
  );

  return { backendModel, backendType, enabledEngineIds };
}

/** Loads coding engine settings. */
export async function loadCodingEngineSettings(
  settingsStore: CodingEngineSettingsStore,
): Promise<CodingEngineSettings> {
  const value = await settingsStore.get<unknown>(CODING_ENGINE_SETTINGS_KEY);
  return normalizeCodingEngineSettings(value);
}

/** Saves coding engine settings. */
export async function saveCodingEngineSettings(
  settingsStore: CodingEngineSettingsStore,
  settings: CodingEngineSettings,
): Promise<CodingEngineSettings> {
  const normalized = normalizeCodingEngineSettings(settings);
  await settingsStore.set(CODING_ENGINE_SETTINGS_KEY, normalized);
  return normalized;
}

/** Returns enabled coding engine IDs. */
export function getEnabledCodingEngineIds(settings: CodingEngineSettings): CodingEngineId[] {
  return [...settings.enabledEngineIds];
}

/** Returns configured AgentLite backend type. */
export function getAgentLiteBackendType(settings: CodingEngineSettings): AgentLiteBackendType {
  return settings.backendType;
}

/** Returns configured AgentLite backend model. */
export function getAgentLiteBackendModel(settings: CodingEngineSettings): string {
  return settings.backendModel;
}

/** Returns configured AgentLite backend options. */
export function getAgentLiteBackendOptions(settings: CodingEngineSettings): AgentBackendOptions {
  const model = settings.backendModel.trim();

  return model
    ? { model, type: settings.backendType }
    : { type: settings.backendType };
}

/** Returns whether a coding engine is enabled. */
export function isCodingEngineEnabled(
  settings: CodingEngineSettings,
  engineId: CodingEngineId,
): boolean {
  return settings.enabledEngineIds.includes(engineId);
}
