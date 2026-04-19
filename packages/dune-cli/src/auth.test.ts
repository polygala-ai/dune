// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readApiKeyFromConfigFile, resolveDuneAuthConfig } from './auth';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-cli-auth-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe('auth config', () => {
  it('reads api keys from ini-style config files', () => {
    const tempDir = createTempDir();
    const configPath = path.join(tempDir, 'config');
    fs.writeFileSync(configPath, 'apiKey="config-secret"\n');

    expect(readApiKeyFromConfigFile(configPath)).toBe('config-secret');
  });

  it('reads api keys from json config files', () => {
    const tempDir = createTempDir();
    const configPath = path.join(tempDir, 'config');
    fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'json-secret' }, null, 2));

    expect(readApiKeyFromConfigFile(configPath)).toBe('json-secret');
  });

  it('prefers DUNE_API_KEY over the config file', () => {
    const tempDir = createTempDir();
    const configPath = path.join(tempDir, 'config');
    fs.writeFileSync(configPath, 'apiKey=config-secret\n');

    expect(
      resolveDuneAuthConfig({
        configPath,
        env: { DUNE_API_KEY: 'env-secret' },
      }),
    ).toEqual({
      apiKey: 'env-secret',
      source: 'env',
    });
  });
});
