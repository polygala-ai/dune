import { describe, expect, it, vi } from 'vitest';

import {
  NetworkProxyManager,
  parsePacProxyResult,
} from '@/electron/main/network/network-proxy-manager';

interface CreateHarnessOptions {
  env?: NodeJS.ProcessEnv;
  resolveProxy?: (url: string) => Promise<string>;
}

function createHarness(options: CreateHarnessOptions = {}) {
  const proxyController = {
    HTTP_PROXY: null as string | null,
    HTTPS_PROXY: null as string | null,
    NO_PROXY: null as string | null,
  };
  const session = {
    forceReloadProxyConfig: vi.fn(async () => undefined),
    resolveProxy: vi.fn(options.resolveProxy ?? (async () => 'DIRECT')),
    setProxy: vi.fn(async () => undefined),
  };
  const logger = {
    info: vi.fn(),
  };
  const setDispatcher = vi.fn();
  const manager = new NetworkProxyManager({
    createProxyController: () => proxyController,
    env: options.env ?? {
      HTTP_PROXY: 'http://system-http-proxy:8080',
      HTTPS_PROXY: 'http://system-https-proxy:8443',
      NO_PROXY: 'internal.example,localhost',
    },
    logger,
    session,
    setDispatcher,
  });

  return {
    logger,
    manager,
    proxyController,
    session,
    setDispatcher,
  };
}

describe('NetworkProxyManager', () => {
  it('applies direct mode to both the Electron session and Node proxy controller', async () => {
    const harness = createHarness();

    await harness.manager.apply({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'direct',
    });

    expect(harness.proxyController).toEqual({
      HTTP_PROXY: null,
      HTTPS_PROXY: null,
      NO_PROXY: null,
    });
    expect(harness.session.setProxy).toHaveBeenCalledWith({
      mode: 'direct',
    });
    expect(harness.setDispatcher).toHaveBeenCalledTimes(1);
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('Agent');
  });

  it('copies system proxy environment values into the Node proxy controller', async () => {
    const harness = createHarness();

    await harness.manager.apply({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });

    expect(harness.proxyController).toEqual({
      HTTP_PROXY: 'http://system-http-proxy:8080',
      HTTPS_PROXY: 'http://system-https-proxy:8443',
      NO_PROXY: 'internal.example,localhost,127.0.0.1,::1',
    });
    expect(harness.session.setProxy).toHaveBeenCalledWith({
      mode: 'system',
      proxyBypassRules: 'localhost,127.0.0.1,::1',
    });
    expect(harness.session.resolveProxy).not.toHaveBeenCalled();
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('ProxyAgent');
  });

  it('falls back to session.resolveProxy when system env has no HTTP_PROXY', async () => {
    const harness = createHarness({
      env: {},
      resolveProxy: async () => 'PROXY 127.0.0.1:7890; DIRECT',
    });

    await harness.manager.apply({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });

    expect(harness.session.resolveProxy).toHaveBeenCalledWith('https://api.telegram.org');
    expect(harness.proxyController).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      NO_PROXY: 'localhost,127.0.0.1,::1',
    });
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('ProxyAgent');
  });

  it('treats system mode as direct when PAC resolves to DIRECT', async () => {
    const harness = createHarness({
      env: {},
      resolveProxy: async () => 'DIRECT',
    });

    await harness.manager.apply({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });

    expect(harness.proxyController).toEqual({
      HTTP_PROXY: null,
      HTTPS_PROXY: null,
      NO_PROXY: 'localhost,127.0.0.1,::1',
    });
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('Agent');
  });

  it('keeps applying even when session.resolveProxy rejects', async () => {
    const harness = createHarness({
      env: {},
      resolveProxy: async () => {
        throw new Error('PAC resolver offline');
      },
    });

    await harness.manager.apply({
      bypassRules: [],
      manualProxyUrl: '',
      mode: 'system',
    });

    expect(harness.proxyController.HTTP_PROXY).toBeNull();
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('Agent');
    expect(harness.logger.info).toHaveBeenCalledWith(
      'Failed to resolve system proxy via Electron session.',
      expect.any(Object),
    );
  });

  it('applies manual proxy settings and appends loopback bypass rules', async () => {
    const harness = createHarness();

    await harness.manager.apply({
      bypassRules: ['internal.example', 'localhost'],
      manualProxyUrl: 'http://127.0.0.1:7890/',
      mode: 'manual',
    });

    expect(harness.proxyController).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7890/',
      HTTPS_PROXY: 'http://127.0.0.1:7890/',
      NO_PROXY: 'internal.example,localhost,127.0.0.1,::1',
    });
    expect(harness.session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyBypassRules: 'internal.example,localhost,127.0.0.1,::1',
      proxyRules: 'http=http://127.0.0.1:7890/;https=http://127.0.0.1:7890/',
    });
    expect(harness.session.forceReloadProxyConfig).toHaveBeenCalledTimes(1);
    expect(harness.setDispatcher.mock.calls[0]?.[0]?.constructor?.name).toBe('ProxyAgent');
  });
});

describe('parsePacProxyResult', () => {
  it('returns null for empty and DIRECT results', () => {
    expect(parsePacProxyResult(null)).toBeNull();
    expect(parsePacProxyResult('')).toBeNull();
    expect(parsePacProxyResult('DIRECT')).toBeNull();
  });

  it('extracts the first PROXY entry from a PAC result', () => {
    expect(parsePacProxyResult('PROXY 127.0.0.1:7890')).toBe('http://127.0.0.1:7890');
    expect(parsePacProxyResult('PROXY 127.0.0.1:7890; DIRECT')).toBe('http://127.0.0.1:7890');
    expect(parsePacProxyResult('PROXY a:1; PROXY b:2')).toBe('http://a:1');
  });

  it('ignores unsupported schemes like SOCKS', () => {
    expect(parsePacProxyResult('SOCKS 127.0.0.1:1080; DIRECT')).toBeNull();
    expect(parsePacProxyResult('SOCKS5 127.0.0.1:1080; DIRECT')).toBeNull();
  });
});
