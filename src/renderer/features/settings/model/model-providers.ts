// Model provider validation, storage, and credential resolution.

import { isPlainObject } from '@/shared/is-record';

/** Supported model auth values. */
export type ModelAuthType = 'api-key' | 'oauth-token';

/** Model provider shape. */
export interface ModelProvider {
  authType: ModelAuthType;
  baseUrl: string;
  id: string;
  isDefault: boolean;
  name: string;
}

/** Model provider store dependencies. */
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

/** Storage key for model providers. */
export const MODEL_PROVIDERS_KEY = 'modelProviders';

const CLAUDE_CODE_OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN';
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const ANTHROPIC_BASE_URL_ENV = 'ANTHROPIC_BASE_URL';
const MODEL_PROVIDER_SECRET_PREFIX = 'model-provider:';

/** Returns whether the value is a model auth type. */
function isModelAuthType(value: unknown): value is ModelAuthType {
  return value === 'api-key' || value === 'oauth-token';
}

/** Returns whether the value is a model provider. */
export function isModelProvider(value: unknown): value is ModelProvider {
  return isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.isDefault === 'boolean' &&
    isModelAuthType(value.authType);
}

/** Normalizes provider. */
function normalizeProvider(provider: ModelProvider): ModelProvider {
  return {
    authType: provider.authType,
    baseUrl: provider.authType === 'oauth-token' ? '' : provider.baseUrl.trim(),
    id: provider.id,
    isDefault: provider.isDefault,
    name: provider.name.trim(),
  };
}

/** Normalizes providers. */
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

/** Returns model provider secret key. */
export function getModelProviderSecretKey(providerId: string) {
  return `${MODEL_PROVIDER_SECRET_PREFIX}${providerId}`;
}

/** Returns whether the key is a model provider secret key. */
export function isModelProviderSecretKey(key: string) {
  return key.startsWith(MODEL_PROVIDER_SECRET_PREFIX);
}

/** Reads model provider secret. */
export async function readModelProviderSecret(
  secretsStore: ModelProviderStores['secretsStore'],
  providerId: string,
) {
  const value = await secretsStore.get<string>(getModelProviderSecretKey(providerId));
  return typeof value === 'string' ? value : '';
}

/** Writes model provider secret. */
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

/** Deletes model provider secret. */
export async function deleteModelProviderSecret(
  secretsStore: ModelProviderStores['secretsStore'],
  providerId: string,
) {
  await secretsStore.delete(getModelProviderSecretKey(providerId));
}

/** Loads model providers. */
export async function loadModelProviders({
  settingsStore,
}: ModelProviderStores): Promise<ModelProvider[]> {
  const rawProviders = await settingsStore.get<unknown>(MODEL_PROVIDERS_KEY);

  if (!Array.isArray(rawProviders)) {
    return [];
  }

  return normalizeProviders(rawProviders.filter(isModelProvider));
}

/** Saves model providers. */
export async function saveModelProviders(
  settingsStore: ModelProviderStores['settingsStore'],
  providers: ModelProvider[],
) {
  const normalizedProviders = normalizeProviders(providers);
  await settingsStore.set(MODEL_PROVIDERS_KEY, normalizedProviders);
  return normalizedProviders;
}

/** Resolves default model credentials. */
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
