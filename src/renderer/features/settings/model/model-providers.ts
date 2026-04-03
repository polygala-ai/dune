export type ModelAuthType = 'api-key' | 'oauth-token';

export interface ModelProvider {
  authType: ModelAuthType;
  baseUrl: string;
  id: string;
  isDefault: boolean;
  name: string;
}

interface LegacyModelProvider {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  id: string;
  name: string;
}

export interface ModelProviderStores {
  secretsStore: {
    delete: (key: string) => Promise<void>;
    get: <T>(key: string) => Promise<T | null>;
    set: <T>(key: string, value: T) => Promise<void>;
  };
  settingsStore: {
    get: <T>(key: string) => Promise<T | null>;
    set: <T>(key: string, value: T) => Promise<void>;
  };
}

export const MODEL_PROVIDERS_KEY = 'modelProviders';

const CLAUDE_CODE_OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const ANTHROPIC_BASE_URL_ENV = 'ANTHROPIC_BASE_URL';
const MODEL_PROVIDER_SECRET_PREFIX = 'model-provider:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isModelAuthType(value: unknown): value is ModelAuthType {
  return value === 'api-key' || value === 'oauth-token';
}

export function isModelProvider(value: unknown): value is ModelProvider {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.isDefault === 'boolean' &&
    isModelAuthType(value.authType);
}

function isLegacyModelProvider(value: unknown): value is LegacyModelProvider {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.apiKey === 'string' &&
    typeof value.enabled === 'boolean';
}

function normalizeProvider(provider: ModelProvider): ModelProvider {
  return {
    authType: provider.authType,
    baseUrl: provider.authType === 'oauth-token' ? '' : provider.baseUrl.trim(),
    id: provider.id,
    isDefault: provider.isDefault,
    name: provider.name.trim(),
  };
}

function normalizeProviders(providers: ModelProvider[]): ModelProvider[] {
  let defaultAssigned = false;

  return providers.map((provider) => {
    const normalized = normalizeProvider(provider);
    const isDefault = normalized.isDefault && !defaultAssigned;

    if (isDefault) {
      defaultAssigned = true;
    }

    return {
      ...normalized,
      isDefault,
    };
  }).filter((provider) => provider.id && provider.name);
}

function legacyProvidersDefaultId(
  currentProviders: ModelProvider[],
  legacyProviders: LegacyModelProvider[],
): string | null {
  if (currentProviders.some((provider) => provider.isDefault)) {
    return null;
  }

  const enabledProviders = legacyProviders.filter((provider) => provider.enabled);

  return enabledProviders.length === 1 ? enabledProviders[0]?.id ?? null : null;
}

export function getModelProviderSecretKey(providerId: string) {
  return `${MODEL_PROVIDER_SECRET_PREFIX}${providerId}`;
}

export function isModelProviderSecretKey(key: string) {
  return key.startsWith(MODEL_PROVIDER_SECRET_PREFIX);
}

export async function readModelProviderSecret(
  secretsStore: ModelProviderStores['secretsStore'],
  providerId: string,
) {
  const value = await secretsStore.get<string>(getModelProviderSecretKey(providerId));
  return typeof value === 'string' ? value : '';
}

export async function writeModelProviderSecret(
  secretsStore: ModelProviderStores['secretsStore'],
  providerId: string,
  value: string,
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    await secretsStore.delete(getModelProviderSecretKey(providerId));
    return;
  }

  await secretsStore.set(getModelProviderSecretKey(providerId), trimmedValue);
}

export async function deleteModelProviderSecret(
  secretsStore: ModelProviderStores['secretsStore'],
  providerId: string,
) {
  await secretsStore.delete(getModelProviderSecretKey(providerId));
}

export async function migrateModelProviders({
  secretsStore,
  settingsStore,
}: ModelProviderStores): Promise<ModelProvider[]> {
  const rawProviders = await settingsStore.get<unknown>(MODEL_PROVIDERS_KEY);

  if (!Array.isArray(rawProviders)) {
    return [];
  }

  const currentProviders: ModelProvider[] = [];
  const legacyProviders: LegacyModelProvider[] = [];

  for (const item of rawProviders) {
    if (isModelProvider(item)) {
      currentProviders.push(item);
      continue;
    }

    if (isLegacyModelProvider(item)) {
      legacyProviders.push(item);
    }
  }

  const migratedLegacyDefaultId = legacyProvidersDefaultId(currentProviders, legacyProviders);
  const migratedLegacyProviders = legacyProviders.map((provider) => ({
    authType: 'api-key' as const,
    baseUrl: provider.baseUrl,
    id: provider.id,
    isDefault: provider.id === migratedLegacyDefaultId,
    name: provider.name,
  }));

  for (const provider of legacyProviders) {
    await writeModelProviderSecret(secretsStore, provider.id, provider.apiKey);
  }

  const nextProviders = normalizeProviders([
    ...currentProviders,
    ...migratedLegacyProviders,
  ]);

  if (JSON.stringify(rawProviders) !== JSON.stringify(nextProviders)) {
    await settingsStore.set(MODEL_PROVIDERS_KEY, nextProviders);
  }

  return nextProviders;
}

export async function loadModelProviders(stores: ModelProviderStores) {
  return migrateModelProviders(stores);
}

export async function saveModelProviders(
  settingsStore: ModelProviderStores['settingsStore'],
  providers: ModelProvider[],
) {
  const normalizedProviders = normalizeProviders(providers);
  await settingsStore.set(MODEL_PROVIDERS_KEY, normalizedProviders);
  return normalizedProviders;
}

export async function resolveDefaultModelCredentials({
  secretsStore,
  settingsStore,
}: ModelProviderStores) {
  const providers = await loadModelProviders({ secretsStore, settingsStore });
  const defaultProvider = providers.find((provider) => provider.isDefault);

  if (!defaultProvider) {
    return {} satisfies Record<string, string>;
  }

  const secret = await readModelProviderSecret(secretsStore, defaultProvider.id);

  if (!secret) {
    return {} satisfies Record<string, string>;
  }

  if (defaultProvider.authType === 'oauth-token') {
    return {
      [CLAUDE_CODE_OAUTH_TOKEN_ENV]: secret,
    };
  }

  return {
    ...(defaultProvider.baseUrl ? { [ANTHROPIC_BASE_URL_ENV]: defaultProvider.baseUrl } : {}),
    [ANTHROPIC_API_KEY_ENV]: secret,
  };
}
