// Model provider model tests.

import { describe, expect, it } from 'vitest';

import {
  getModelProviderSecretKey,
  isModelProvider,
  normalizeModelProviders,
} from '@/renderer/features/settings/model/model-providers';

describe('model provider model', () => {
  it('keeps only the first default provider when normalizing', () => {
    expect(normalizeModelProviders([
      {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        id: 'provider-1',
        isDefault: true,
        name: 'First',
        providerKind: 'openai',
      },
      {
        authType: 'oauth-token',
        baseUrl: 'should-clear',
        id: 'provider-2',
        isDefault: true,
        name: 'Second',
        providerKind: 'openai',
      },
    ])).toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://first.com',
        id: 'provider-1',
        isDefault: true,
        name: 'First',
        providerKind: 'openai',
      },
      {
        authType: 'oauth-token',
        baseUrl: '',
        id: 'provider-2',
        isDefault: false,
        name: 'Second',
        providerKind: 'anthropic',
      },
    ]);
  });

  it('filters invalid providers and trims provider fields', () => {
    expect(normalizeModelProviders([
      {
        authType: 'api-key',
        baseUrl: ' https://compatible.example/v1 ',
        id: 'provider-1',
        isDefault: true,
        name: ' Compatible ',
        providerKind: 'anthropic',
      },
    ])).toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://compatible.example/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
        providerKind: 'anthropic',
      },
    ]);
    expect(isModelProvider({ id: 'provider-1' })).toBe(false);
  });

  it('infers OpenAI kind for legacy providers', () => {
    expect(normalizeModelProviders([
      {
        authType: 'api-key',
        baseUrl: 'https://api.openai.com/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
      } as any,
    ])).toEqual([
      {
        authType: 'api-key',
        baseUrl: 'https://api.openai.com/v1',
        id: 'provider-1',
        isDefault: true,
        name: 'Compatible',
        providerKind: 'openai',
      },
    ]);
  });

  it('builds stable secret keys', () => {
    expect(getModelProviderSecretKey('provider-1')).toBe('model-provider:provider-1');
  });
});
