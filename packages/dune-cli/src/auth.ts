import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DuneAuthConfig {
  apiKey: string | null;
  source: 'config' | 'env' | null;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function readApiKeyFromJsonConfig(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const candidate = parsed.apiKey ?? parsed.api_key ?? parsed.DUNE_API_KEY;

    return typeof candidate === 'string' && candidate.trim()
      ? candidate.trim()
      : null;
  } catch {
    return null;
  }
}

function readApiKeyFromLineConfig(content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.includes('=')
      ? line.indexOf('=')
      : line.indexOf(':');

    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());

    if (
      (key === 'apiKey' || key === 'api_key' || key === 'DUNE_API_KEY')
      && value
    ) {
      return value;
    }
  }

  return null;
}

export function readApiKeyFromConfigFile(configPath: string): string | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8').trim();

  if (!content) {
    return null;
  }

  if (content.startsWith('{')) {
    return readApiKeyFromJsonConfig(content);
  }

  return readApiKeyFromLineConfig(content);
}

export function resolveDuneAuthConfig(
  options: {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
  } = {},
): DuneAuthConfig {
  const env = options.env ?? process.env;
  const envApiKey = env.DUNE_API_KEY?.trim();

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      source: 'env',
    };
  }

  const homeDir = options.homeDir ?? os.homedir();
  const configPath = options.configPath ?? path.join(homeDir, '.dune', 'config');
  const configApiKey = readApiKeyFromConfigFile(configPath);

  return {
    apiKey: configApiKey,
    source: configApiKey ? 'config' : null,
  };
}
