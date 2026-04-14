// Network proxy coordination.

import type { ProxyConfig } from 'electron';
import { createGlobalProxyAgent } from 'global-agent';
import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';

import type { NetworkSettings } from '@/renderer/features/settings/model/network-settings';

/** Proxy controller contract. */
export interface ProxyController {
  HTTP_PROXY: string | null;
  HTTPS_PROXY: string | null;
  NO_PROXY: string | null;
}

/** Electron session proxy contract. */
interface ProxySession {
  forceReloadProxyConfig?: () => Promise<void>;
  resolveProxy: (url: string) => Promise<string>;
  setProxy: (config: ProxyConfig) => Promise<void>;
}

/** Logger-like contract. */
interface LoggerLike {
  info?: (message: string, ...args: unknown[]) => void;
}

/** Network proxy manager options. */
export interface NetworkProxyManagerOptions {
  createProxyController?: () => ProxyController;
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike;
  session: ProxySession;
  setDispatcher?: (dispatcher: Dispatcher) => void;
}

/** Loopback bypass rules constant. */
export const LOOPBACK_BYPASS_RULES = ['localhost', '127.0.0.1', '::1'] as const;
/** Dune proxy env namespace constant. */
export const DUNE_PROXY_ENV_NAMESPACE = 'DUNE_PROXY_';

// Representative URL used to ask Electron's session for the PAC-resolved proxy
// when the app runs without HTTP_PROXY in its env (e.g. launched from Finder).
const SYSTEM_PROXY_PROBE_URL = 'https://api.telegram.org';

/** Splits bypass rules. */
function splitBypassRules(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\n]/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

/** Merges bypass rules. */
function mergeBypassRules(...ruleSets: Array<readonly string[]>) {
  return [...new Set(ruleSets.flatMap((rules) => rules.map((rule) => rule.trim()).filter(Boolean)))];
}

/** Picks env value. */
function pickEnvValue(
  env: NodeJS.ProcessEnv,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

/** Redacts proxy URL. */
function redactProxyUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/** Builds proxy rules. */
function buildProxyRules(proxyUrl: string) {
  return `http=${proxyUrl};https=${proxyUrl}`;
}

// PAC results look like "PROXY host:port; DIRECT" or "DIRECT". Pick the first
// HTTP PROXY entry if there is one, otherwise null. SOCKS is not supported by
// global-agent or undici ProxyAgent, so SOCKS entries are treated as direct.
/** Parses PAC proxy result. */
export function parsePacProxyResult(pac: string | null | undefined): string | null {
  if (!pac) {
    return null;
  }

  const entries = pac.split(';').map((entry) => entry.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^PROXY\s+(\S+:\d+)$/i);

    if (match) {
      return `http://${match[1]}`;
    }
  }

  return null;
}

/** Manages network proxy. */
export class NetworkProxyManager {
  private readonly env: NodeJS.ProcessEnv;

  private readonly logger: LoggerLike;

  private readonly proxyController: ProxyController;

  private readonly session: ProxySession;

  private readonly setDispatcher: (dispatcher: Dispatcher) => void;

  constructor(options: NetworkProxyManagerOptions) {
    this.env = options.env ?? process.env;
    this.logger = options.logger ?? console;
    this.proxyController = options.createProxyController?.()
      ?? createGlobalProxyAgent({
        environmentVariableNamespace: DUNE_PROXY_ENV_NAMESPACE,
        forceGlobalAgent: true,
        socketConnectionTimeout: 15_000,
      });
    this.session = options.session;
    this.setDispatcher = options.setDispatcher ?? setGlobalDispatcher;
  }

  /** Applies network proxy. */
  async apply(settings: NetworkSettings) {
    const electronProxyConfig = this.buildElectronProxyConfig(settings);

    // Apply the Chromium session proxy FIRST so that a subsequent
    // session.resolveProxy() call in system mode runs against the correct
    // PAC/system config.
    await this.session.setProxy(electronProxyConfig);
    await this.session.forceReloadProxyConfig?.();

    const nodeProxyState = await this.buildNodeProxyState(settings);

    this.proxyController.HTTP_PROXY = nodeProxyState.HTTP_PROXY;
    this.proxyController.HTTPS_PROXY = nodeProxyState.HTTPS_PROXY;
    this.proxyController.NO_PROXY = nodeProxyState.NO_PROXY;

    const dispatcherTarget = nodeProxyState.HTTPS_PROXY ?? nodeProxyState.HTTP_PROXY;
    this.setDispatcher(dispatcherTarget ? new ProxyAgent(dispatcherTarget) : new Agent());

    this.logger.info?.('Applied Dune network settings.', {
      mode: settings.mode,
      nodeProxy: {
        bypassRules: nodeProxyState.NO_PROXY,
        httpProxy: redactProxyUrl(nodeProxyState.HTTP_PROXY),
        httpsProxy: redactProxyUrl(nodeProxyState.HTTPS_PROXY),
        resolvedVia: nodeProxyState.resolvedVia,
      },
      sessionProxy: {
        ...electronProxyConfig,
        ...(electronProxyConfig.proxyRules
          ? { proxyRules: redactProxyUrl(electronProxyConfig.proxyRules) }
          : {}),
      },
    });
  }

  private buildElectronProxyConfig(settings: NetworkSettings): ProxyConfig {
    const loopbackBypassRules = LOOPBACK_BYPASS_RULES.join(',');

    switch (settings.mode) {
      case 'direct':
        return { mode: 'direct' };
      case 'manual': {
        const mergedBypassRules = mergeBypassRules(
          settings.bypassRules,
          LOOPBACK_BYPASS_RULES,
        );

        return {
          mode: 'fixed_servers',
          proxyBypassRules: mergedBypassRules.join(','),
          proxyRules: buildProxyRules(settings.manualProxyUrl),
        };
      }
      case 'system':
      default:
        return {
          mode: 'system',
          proxyBypassRules: loopbackBypassRules,
        };
    }
  }

  private async buildNodeProxyState(settings: NetworkSettings) {
    switch (settings.mode) {
      case 'direct':
        return {
          HTTP_PROXY: null,
          HTTPS_PROXY: null,
          NO_PROXY: null,
          resolvedVia: 'direct' as const,
        };
      case 'manual': {
        const mergedBypassRules = mergeBypassRules(
          settings.bypassRules,
          LOOPBACK_BYPASS_RULES,
        );

        return {
          HTTP_PROXY: settings.manualProxyUrl,
          HTTPS_PROXY: settings.manualProxyUrl,
          NO_PROXY: mergedBypassRules.join(','),
          resolvedVia: 'manual' as const,
        };
      }
      case 'system':
      default: {
        const mergedBypassRules = mergeBypassRules(
          splitBypassRules(pickEnvValue(this.env, 'NO_PROXY', 'no_proxy')),
          LOOPBACK_BYPASS_RULES,
        );
        const envHttpProxy = pickEnvValue(this.env, 'HTTP_PROXY', 'http_proxy');
        const envHttpsProxy = pickEnvValue(this.env, 'HTTPS_PROXY', 'https_proxy');

        if (envHttpProxy || envHttpsProxy) {
          return {
            HTTP_PROXY: envHttpProxy,
            HTTPS_PROXY: envHttpsProxy,
            NO_PROXY: mergedBypassRules.length > 0 ? mergedBypassRules.join(',') : null,
            resolvedVia: 'env' as const,
          };
        }

        // Packaged macOS apps launched from Finder don't inherit shell env, so
        // fall back to asking Chromium to resolve the PAC/system proxy for us.
        let pacProxy: string | null = null;

        try {
          const pac = await this.session.resolveProxy(SYSTEM_PROXY_PROBE_URL);
          pacProxy = parsePacProxyResult(pac);
        } catch (error) {
          this.logger.info?.('Failed to resolve system proxy via Electron session.', { error });
        }

        return {
          HTTP_PROXY: pacProxy,
          HTTPS_PROXY: pacProxy,
          NO_PROXY: mergedBypassRules.length > 0 ? mergedBypassRules.join(',') : null,
          resolvedVia: pacProxy ? ('electron-resolve' as const) : ('direct' as const),
        };
      }
    }
  }
}
