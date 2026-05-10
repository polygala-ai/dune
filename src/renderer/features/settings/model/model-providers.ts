// Model provider validation and normalization.

import { isPlainObject } from '@/shared/is-record';

/** Supported model auth values. */
export type ModelAuthType = 'api-key' | 'oauth-token';

/** Supported model provider kinds. */
export type ModelProviderKind = 'anthropic' | 'openai';

/** Model provider shape. */
export interface ModelProvider {
  authType: ModelAuthType;
  baseUrl: string;
  id: string;
  isDefault: boolean;
  name: string;
  providerKind: ModelProviderKind;
}

/** Legacy settings key for migrated model providers. */
export const MODEL_PROVIDERS_KEY = 'modelProviders';

const MODEL_PROVIDER_SECRET_PREFIX = 'model-provider:';

/** Returns whether the value is a model auth type. */
function isModelAuthType(value: unknown): value is ModelAuthType {
  return value === 'api-key' || value === 'oauth-token';
}

/** Returns whether the value is a model provider kind. */
function isModelProviderKind(value: unknown): value is ModelProviderKind {
  return value === 'anthropic' || value === 'openai';
}

/** Infers provider kind for providers saved before provider kinds existed. */
function inferLegacyProviderKind(provider: { baseUrl: string; name: string }): ModelProviderKind {
  const searchable = `${provider.name} ${provider.baseUrl}`.toLowerCase();

  return searchable.includes('openai') ? 'openai' : 'anthropic';
}

/** Returns whether the value is a model provider. */
export function isModelProvider(value: unknown): value is ModelProvider {
  return isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.isDefault === 'boolean' &&
    isModelAuthType(value.authType) &&
    (
      value.providerKind === undefined ||
      isModelProviderKind(value.providerKind)
    );
}

/** Normalizes provider. */
function normalizeProvider(provider: ModelProvider): ModelProvider {
  const providerKind = provider.authType === 'oauth-token'
    ? 'anthropic'
    : isModelProviderKind(provider.providerKind)
      ? provider.providerKind
      : inferLegacyProviderKind(provider);

  return {
    authType: provider.authType,
    baseUrl: provider.authType === 'oauth-token' ? '' : provider.baseUrl.trim(),
    id: provider.id,
    isDefault: provider.isDefault,
    name: provider.name.trim(),
    providerKind,
  };
}

/** Normalizes providers. */
export function normalizeModelProviders(providers: ModelProvider[]): ModelProvider[] {
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
