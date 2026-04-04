import type { ProxyConfig } from 'electron';
import { createGlobalProxyAgent } from 'global-agent';

import type { NetworkSettings } from '@/renderer/features/settings/model/network-settings';

export interface ProxyController {
  HTTP_PROXY: string | null;
  HTTPS_PROXY: string | null;
  NO_PROXY: string | null;
}

interface ProxySession {
  forceReloadProxyConfig?: () => Promise<void>;
  setProxy: (config: ProxyConfig) => Promise<void>;
}

interface LoggerLike {
  info?: (message: string, ...args: unknown[]) => void;
}

export interface NetworkProxyManagerOptions {
  createProxyController?: () => ProxyController;
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike;
  session: ProxySession;
}

export const LOOPBACK_BYPASS_RULES = ['localhost', '127.0.0.1', '::1'] as const;
export const DUNE_PROXY_ENV_NAMESPACE = 'DUNE_PROXY_';

function splitBypassRules(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\n]/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function mergeBypassRules(...ruleSets: Array<readonly string[]>) {
  return [...new Set(ruleSets.flatMap((rules) => rules.map((rule) => rule.trim()).filter(Boolean)))];
}

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

function buildProxyRules(proxyUrl: string) {
  return `http=${proxyUrl};https=${proxyUrl}`;
}

export class NetworkProxyManager {
  private readonly env: NodeJS.ProcessEnv;

  private readonly logger: LoggerLike;

  private readonly proxyController: ProxyController;

  private readonly session: ProxySession;

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
  }

  async apply(settings: NetworkSettings) {
    const nodeProxyState = this.buildNodeProxyState(settings);
    const electronProxyConfig = this.buildElectronProxyConfig(settings);

    this.proxyController.HTTP_PROXY = nodeProxyState.HTTP_PROXY;
    this.proxyController.HTTPS_PROXY = nodeProxyState.HTTPS_PROXY;
    this.proxyController.NO_PROXY = nodeProxyState.NO_PROXY;

    await this.session.setProxy(electronProxyConfig);
    await this.session.forceReloadProxyConfig?.();

    this.logger.info?.('Applied Dune network settings.', {
      mode: settings.mode,
      nodeProxy: {
        bypassRules: nodeProxyState.NO_PROXY,
        httpProxy: redactProxyUrl(nodeProxyState.HTTP_PROXY),
        httpsProxy: redactProxyUrl(nodeProxyState.HTTPS_PROXY),
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

  private buildNodeProxyState(settings: NetworkSettings) {
    switch (settings.mode) {
      case 'direct':
        return {
          HTTP_PROXY: null,
          HTTPS_PROXY: null,
          NO_PROXY: null,
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
        };
      }
      case 'system':
      default: {
        const mergedBypassRules = mergeBypassRules(
          splitBypassRules(pickEnvValue(this.env, 'NO_PROXY', 'no_proxy')),
          LOOPBACK_BYPASS_RULES,
        );

        return {
          HTTP_PROXY: pickEnvValue(this.env, 'HTTP_PROXY', 'http_proxy'),
          HTTPS_PROXY: pickEnvValue(this.env, 'HTTPS_PROXY', 'https_proxy'),
          NO_PROXY: mergedBypassRules.length > 0 ? mergedBypassRules.join(',') : null,
        };
      }
    }
  }
}
