// Model provider helper tests.

import { describe, expect, it } from 'vitest';

import {
  MODEL_PROVIDERS_KEY,
  deleteModelProviderSecret,
  getModelProviderSecretKey,
  resolveDefaultModelCredentials,
  saveModelProviders,
} from '@/renderer/features/settings/model/model-providers';

/** Memory store. */
class MemoryStore {
  private readonly data = new Map<string, unknown>();

  /** Deletes memory store. */
  async delete(key: string) {
    this.data.delete(key);
  }

  /** Returns memory store. */
  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  /** Sets memory store. */
  async set<T>(key: string, value: T) {
    this.data.set(key, value);
  }
}

/** Creates stores. */
function createStores() {
  return {
    secretsStore: new MemoryStore(),
    settingsStore: new MemoryStore(),
  };
}

describe('model provider storage', () => {
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
