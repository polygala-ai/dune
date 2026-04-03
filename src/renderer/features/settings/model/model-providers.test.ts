import { describe, expect, it } from 'vitest';

import {
  MODEL_PROVIDERS_KEY,
  deleteModelProviderSecret,
  getModelProviderSecretKey,
  migrateModelProviders,
  readModelProviderSecret,
  resolveDefaultModelCredentials,
  saveModelProviders,
  type ModelProvider,
} from './model-providers';

class MemoryStore {
  private readonly data = new Map<string, unknown>();

  async delete(key: string) {
    this.data.delete(key);
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T) {
    this.data.set(key, value);
  }
}

function createStores() {
  return {
    secretsStore: new MemoryStore(),
    settingsStore: new MemoryStore(),
  };
}

describe('model provider storage', () => {
  it('migrates legacy plaintext api keys into secrets and default state', async () => {
    const stores = createStores();

    await stores.settingsStore.set(MODEL_PROVIDERS_KEY, [
      {
        apiKey: 'sk-legacy-secret',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        id: 'provider-1',
        name: 'Legacy',
      },
    ]);

    const providers = await migrateModelProviders(stores);

    expect(providers).toEqual<ModelProvider[]>([
      {
        authType: 'api-key',
        baseUrl: 'https://api.openai.com/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Legacy',
      },
    ]);
    expect(await readModelProviderSecret(stores.secretsStore, 'provider-1')).toBe('sk-legacy-secret');
    expect(await stores.settingsStore.get(MODEL_PROVIDERS_KEY)).toEqual(providers);
  });

  it('does not auto-select a default when multiple legacy providers were enabled', async () => {
    const stores = createStores();

    await stores.settingsStore.set(MODEL_PROVIDERS_KEY, [
      {
        apiKey: 'first-secret',
        baseUrl: 'https://first.com',
        enabled: true,
        id: 'provider-1',
        name: 'First',
      },
      {
        apiKey: 'second-secret',
        baseUrl: 'https://second.com',
        enabled: true,
        id: 'provider-2',
        name: 'Second',
      },
    ]);

    const providers = await migrateModelProviders(stores);

    expect(providers.map((provider) => provider.isDefault)).toEqual([false, false]);
    expect(await readModelProviderSecret(stores.secretsStore, 'provider-1')).toBe('first-secret');
    expect(await readModelProviderSecret(stores.secretsStore, 'provider-2')).toBe('second-secret');
  });

  it('keeps only the first default provider when saving', async () => {
    const stores = createStores();

    const providers = await saveModelProviders(stores.settingsStore, [
      {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        id: 'provider-1',
        isDefault: true,
        name: 'First',
      },
      {
        authType: 'oauth-token',
        baseUrl: 'should-clear',
        id: 'provider-2',
        isDefault: true,
        name: 'Second',
      },
    ]);

    expect(providers).toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        id: 'provider-1',
        isDefault: true,
        name: 'First',
      },
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-2',
        isDefault: false,
        name: 'Second',
      },
    ]);
  });

  it('resolves oauth-token credentials from the default provider', async () => {
    const stores = createStores();

    await stores.settingsStore.set(MODEL_PROVIDERS_KEY, [
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-1',
        isDefault: true,
        name: 'Claude Code',
      },
    ]);
    await stores.secretsStore.set(getModelProviderSecretKey('provider-1'), 'oauth-secret');

    await expect(resolveDefaultModelCredentials(stores)).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
    });
  });

  it('resolves api-key credentials and base url from the default provider', async () => {
    const stores = createStores();

    await stores.settingsStore.set(MODEL_PROVIDERS_KEY, [
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
      },
    ]);
    await stores.secretsStore.set(getModelProviderSecretKey('provider-1'), 'api-secret');

    await expect(resolveDefaultModelCredentials(stores)).resolves.toEqual({
      ANTHROPIC_API_KEY: 'api-secret',
      ANTHROPIC_BASE_URL: 'https://compatible.example/v1',
    });
  });

  it('returns empty credentials without a default provider or secret', async () => {
    const stores = createStores();

    await stores.settingsStore.set(MODEL_PROVIDERS_KEY, [
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-1',
        isDefault: false,
        name: 'Compatible',
      },
    ]);

    await expect(resolveDefaultModelCredentials(stores)).resolves.toEqual({});

    await saveModelProviders(stores.settingsStore, [
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
      },
    ]);

    await expect(resolveDefaultModelCredentials(stores)).resolves.toEqual({});

    await deleteModelProviderSecret(stores.secretsStore, 'provider-1');
  });
});
