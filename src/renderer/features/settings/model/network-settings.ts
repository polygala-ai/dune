export const NETWORK_SETTINGS_KEY = 'network';

export type NetworkProxyMode = 'direct' | 'manual' | 'system';

export interface NetworkSettings {
  bypassRules: string[];
  manualProxyUrl: string;
  mode: NetworkProxyMode;
}

export interface NetworkSettingsStore {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T) => Promise<void>;
}

const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  bypassRules: [],
  manualProxyUrl: '',
  mode: 'system',
};

const VALID_MODES = new Set<NetworkProxyMode>(['direct', 'manual', 'system']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeBypassRules(rules: string[]) {
  return [...new Set(
    rules
      .map((rule) => rule.trim())
      .filter(Boolean),
  )];
}

export function normalizeNetworkSettings(value: unknown): NetworkSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_NETWORK_SETTINGS };
  }

  const mode = VALID_MODES.has(value.mode as NetworkProxyMode)
    ? value.mode as NetworkProxyMode
    : DEFAULT_NETWORK_SETTINGS.mode;
  const manualProxyUrl = typeof value.manualProxyUrl === 'string'
    ? value.manualProxyUrl.trim()
    : DEFAULT_NETWORK_SETTINGS.manualProxyUrl;
  const bypassRules = Array.isArray(value.bypassRules)
    ? normalizeBypassRules(
        value.bypassRules.filter((rule): rule is string => typeof rule === 'string'),
      )
    : DEFAULT_NETWORK_SETTINGS.bypassRules;

  return {
    bypassRules,
    manualProxyUrl,
    mode,
  };
}

export function validateNetworkSettings(value: NetworkSettings) {
  const normalized = normalizeNetworkSettings(value);

  if (normalized.mode !== 'manual') {
    return normalized;
  }

  if (!normalized.manualProxyUrl) {
    throw new Error('HTTP proxy URL is required in Manual mode.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized.manualProxyUrl);
  } catch {
    throw new Error('HTTP proxy URL must be a valid URL.');
  }

  if (parsedUrl.protocol !== 'http:') {
    throw new Error('Manual proxy URL must use the http:// protocol.');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Manual proxy authentication is not supported yet.');
  }

  return {
    ...normalized,
    manualProxyUrl: parsedUrl.toString(),
  };
}

export async function loadNetworkSettings(
  settingsStore: NetworkSettingsStore,
) {
  const value = await settingsStore.get<unknown>(NETWORK_SETTINGS_KEY);
  return normalizeNetworkSettings(value);
}

export async function saveNetworkSettings(
  settingsStore: NetworkSettingsStore,
  settings: NetworkSettings,
) {
  const validated = validateNetworkSettings(settings);
  await settingsStore.set(NETWORK_SETTINGS_KEY, validated);
  return validated;
}
