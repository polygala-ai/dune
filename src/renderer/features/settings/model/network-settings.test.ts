import { describe, expect, it } from 'vitest';

import {
  NETWORK_SETTINGS_KEY,
  loadNetworkSettings,
  normalizeBypassRules,
  saveNetworkSettings,
  validateNetworkSettings,
} from '@/renderer/features/settings/model/network-settings';

class MemoryStore {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T) {
    this.data.set(key, value);
  }
}

describe('network settings model', () => {
  it('loads system mode by default', async () => {
    const store = new MemoryStore();

    await expect(loadNetworkSettings(store)).resolves.toEqual({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });
  });

  it('normalizes and persists manual proxy settings', async () => {
    const store = new MemoryStore();

    await expect(
      saveNetworkSettings(store, {
        bypassRules: [' localhost ', '127.0.0.1', 'localhost'],
        manualProxyUrl: ' http://127.0.0.1:7890 ',
        mode: 'manual',
      }),
    ).resolves.toEqual({
      bypassRules: ['localhost', '127.0.0.1'],
      manualProxyUrl: 'http://127.0.0.1:7890/',
      mode: 'manual',
    });
    await expect(store.get(NETWORK_SETTINGS_KEY)).resolves.toEqual({
      bypassRules: ['localhost', '127.0.0.1'],
      manualProxyUrl: 'http://127.0.0.1:7890/',
      mode: 'manual',
    });
  });

  it('rejects invalid manual proxy URLs', () => {
    expect(() => validateNetworkSettings({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'manual',
    })).toThrow('HTTP proxy URL is required in Manual mode.');

    expect(() => validateNetworkSettings({
      bypassRules: [],
      manualProxyUrl: 'socks5://127.0.0.1:7890',
      mode: 'manual',
    })).toThrow('Manual proxy URL must use the http:// protocol.');
  });

  it('rejects authenticated manual proxy URLs in v1', () => {
    expect(() => validateNetworkSettings({
      bypassRules: [],
      manualProxyUrl: 'http://user:pass@127.0.0.1:7890',
      mode: 'manual',
    })).toThrow('Manual proxy authentication is not supported yet.');
  });

  it('normalizes bypass rules by trimming and deduplicating values', () => {
    expect(normalizeBypassRules([
      ' localhost ',
      '',
      '::1',
      'localhost',
      ' 127.0.0.1 ',
    ])).toEqual(['localhost', '::1', '127.0.0.1']);
  });
});
