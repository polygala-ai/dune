// Local data reset tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resetLocalData } from '@/electron/main/reset-local-data';

const tempDirs: string[] = [];

/** Creates temp dir. */
function createTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe('resetLocalData', () => {
  it('clears userData contents and removes the AgentLite runtime root', async () => {
    const homeDir = createTempDir('dune-reset-home-');
    const userDataDir = path.join(homeDir, 'userdata');
    const agentLiteRuntimeRoot = path.join(homeDir, '.dune', 'agentlite');

    fs.mkdirSync(path.join(userDataDir, 'Cache', 'GPU'), { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(userDataDir, 'Cache', 'GPU', 'cache.bin'), 'cache');

    fs.mkdirSync(path.join(agentLiteRuntimeRoot, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(agentLiteRuntimeRoot, 'agents', 'agent-1.json'), '{}');

    await resetLocalData({
      agentLiteRuntimeRoot,
      userDataDir,
    });

    expect(fs.existsSync(userDataDir)).toBe(true);
    expect(fs.readdirSync(userDataDir)).toEqual([]);
    expect(fs.existsSync(agentLiteRuntimeRoot)).toBe(false);
  });

  it('ignores missing local data paths', async () => {
    const homeDir = createTempDir('dune-reset-missing-');

    await expect(
      resetLocalData({
        agentLiteRuntimeRoot: path.join(homeDir, '.dune', 'agentlite'),
        userDataDir: path.join(homeDir, 'userdata'),
      }),
    ).resolves.toBeUndefined();
  });
});
