// Agent runtime path helper tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { seedAgentRunnerSource } from '@/electron/main/runtime/agent-runtime/paths';

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agent-runtime-paths-'));
  tempDirs.push(dir);
  return dir;
}

function resolveRunnerDir(runtimeRoot: string, groupFolder: string) {
  return path.join(
    runtimeRoot,
    'agents',
    groupFolder,
    'data',
    'sessions',
    'main',
    'agent-runner-src',
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe('seedAgentRunnerSource', () => {
  it('replaces a stale copied runner with the installed AgentLite runner source', () => {
    const runtimeRoot = createTempDir();
    const runnerDir = resolveRunnerDir(runtimeRoot, 'stilgar-MGCzGUvf');
    fs.mkdirSync(runnerDir, { recursive: true });
    fs.writeFileSync(path.join(runnerDir, 'index.ts'), 'old claude-only runner');

    seedAgentRunnerSource(runtimeRoot, 'stilgar-MGCzGUvf');

    expect(fs.readFileSync(path.join(runnerDir, 'index.ts'), 'utf-8')).not.toBe(
      'old claude-only runner',
    );
    expect(fs.existsSync(path.join(runnerDir, 'agent-backend.ts'))).toBe(true);
    expect(fs.existsSync(path.join(runnerDir, '.dune-runner-src-fingerprint'))).toBe(true);
  });
});
