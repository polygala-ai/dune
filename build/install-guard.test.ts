import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  assertInstallHygiene,
  assertPnpmOnly,
  findInstallHygieneIssues,
  formatInstallHygieneMessage,
  isPnpmExecution,
} = require('./install-guard.cjs') as {
  assertInstallHygiene: (rootDir?: string) => void;
  assertPnpmOnly: (env?: Record<string, string | undefined>) => void;
  findInstallHygieneIssues: (rootDir?: string) => Array<{
    absolutePath: string;
    description: string;
    relativePath: string;
  }>;
  formatInstallHygieneMessage: (
    issues: Array<{ absolutePath: string; description: string; relativePath: string }>,
    rootDir?: string,
  ) => string;
  isPnpmExecution: (env?: Record<string, string | undefined>) => boolean;
};

describe('install guard', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('accepts pnpm user agents and rejects npm user agents', () => {
    expect(isPnpmExecution({ npm_config_user_agent: 'pnpm/9.15.9 npm/? node/v22.0.0' })).toBe(true);
    expect(isPnpmExecution({ npm_execpath: '/opt/homebrew/bin/pnpm.cjs' })).toBe(true);
    expect(isPnpmExecution({ npm_config_user_agent: 'npm/10.9.2 node/v22.0.0 darwin arm64' })).toBe(false);
    expect(() =>
      assertPnpmOnly({ npm_config_user_agent: 'npm/10.9.2 node/v22.0.0 darwin arm64' }),
    ).toThrow('This repo is pnpm-only.');
  });

  it('reports stale nested native modules from mixed install state', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-install-guard-'));
    const stalePath = path.join(
      rootDir,
      'node_modules',
      '@boxlite-ai',
      'agentlite',
      'node_modules',
      'better-sqlite3',
    );

    tempDirs.push(rootDir);
    fs.mkdirSync(stalePath, { recursive: true });
    fs.writeFileSync(path.join(stalePath, 'package.json'), '{"name":"better-sqlite3"}');

    const issues = findInstallHygieneIssues(rootDir);

    expect(issues).toHaveLength(1);
    expect(formatInstallHygieneMessage(issues, rootDir)).toContain(
      'node_modules/@boxlite-ai/agentlite/node_modules/better-sqlite3',
    );
    expect(() => assertInstallHygiene(rootDir)).toThrow(
      'Detected stale native modules from a mixed install state:',
    );
  });

  it('passes when the install tree is clean', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-install-guard-'));

    tempDirs.push(rootDir);

    expect(findInstallHygieneIssues(rootDir)).toEqual([]);
    expect(() => assertInstallHygiene(rootDir)).not.toThrow();
  });
});
