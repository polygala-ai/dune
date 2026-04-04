import { describe, expect, it, vi } from 'vitest';

import { NetworkProxyManager } from '@/electron/main/network/network-proxy-manager';

function createHarness() {
  const proxyController = {
    HTTP_PROXY: null as string | null,
    HTTPS_PROXY: null as string | null,
    NO_PROXY: null as string | null,
  };
  const session = {
    forceReloadProxyConfig: vi.fn(async () => undefined),
    setProxy: vi.fn(async () => undefined),
  };
  const logger = {
    info: vi.fn(),
  };
  const manager = new NetworkProxyManager({
    createProxyController: () => proxyController,
    env: {
      HTTP_PROXY: 'http://system-http-proxy:8080',
      HTTPS_PROXY: 'http://system-https-proxy:8443',
      NO_PROXY: 'internal.example,localhost',
    },
    logger,
    session,
  });

  return {
    logger,
    manager,
    proxyController,
    session,
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
  });
});
