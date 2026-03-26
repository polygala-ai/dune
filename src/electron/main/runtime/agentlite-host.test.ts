import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentLiteHost,
  resolveAgentLiteRuntimeRoot,
} from '@/electron/main/runtime/agentlite-host';

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agentlite-home-'));
}

function createPackageFixture(rootDir: string) {
  const packageRoot = path.join(rootDir, 'agentlite-package');

  fs.mkdirSync(path.join(packageRoot, 'groups', 'global'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'groups', 'main'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'container', 'oci-image'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'groups', 'global', 'CLAUDE.md'),
    'global template',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'groups', 'main', 'CLAUDE.md'),
    'main template',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'container', 'oci-image', 'manifest.json'),
    '{}',
  );

  return packageRoot;
}

function createAgentLiteModuleHarness() {
  const registerGroup = vi.fn();
  const registerChannel = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  let capturedOptions: {
    llm?: {
      credentials?: () => Promise<Record<string, string>>;
    };
    name?: string;
    workdir?: string;
  } | null = null;

  return {
    capturedOptions: () => capturedOptions,
    loadAgentLiteModule: async () => ({
      AgentLite: class {
        constructor(options?: {
          llm?: {
            credentials?: () => Promise<Record<string, string>>;
          };
          name?: string;
          workdir?: string;
        }) {
          capturedOptions = options ?? null;
        }

        registerChannel = registerChannel;
        registerGroup = registerGroup;
        start = start;
        stop = stop;
      },
    }),
    registerChannel,
    registerGroup,
    start,
    stop,
  };
}

describe('AgentLiteHost', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('uses ~/.dune/agentlite as the runtime root and starts AgentLite with a Claude OAuth token when present', async () => {
    const homeDir = createTempHome();
    const packageRoot = createPackageFixture(homeDir);
    const harness = createAgentLiteModuleHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      credentialEnv: {
        CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
      },
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveAgentLitePackageRoot: () => packageRoot,
    });

    await host.start();

    const runtimeRoot = resolveAgentLiteRuntimeRoot(homeDir);
    const capturedOptions = harness.capturedOptions();

    expect(capturedOptions?.workdir).toBe(runtimeRoot);
    expect(capturedOptions?.name).toBe('Dune');
    await expect(capturedOptions?.model?.credentials?.()).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
    });
    expect(host.getSnapshot().runtimeInfo).toEqual({
      message: 'AgentLite is running with explicit Claude credentials.',
      mode: 'real',
      rootPath: runtimeRoot,
      status: 'ready',
    });
    expect(harness.registerChannel).toHaveBeenCalledTimes(1);
    expect(harness.registerGroup).toHaveBeenCalledWith(
      'dune:main',
      expect.objectContaining({
        folder: 'main',
        isMain: true,
        name: 'Dune Control',
        requiresTrigger: false,
      }),
    );
    expect(fs.existsSync(path.join(runtimeRoot, 'groups', 'main', 'CLAUDE.md'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(runtimeRoot, 'groups', 'global', 'CLAUDE.md')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(runtimeRoot, 'container', 'oci-image', 'manifest.json')),
    ).toBe(true);

    await host.shutdown();

    expect(harness.stop).toHaveBeenCalledTimes(1);
  });

  it('falls back to ANTHROPIC_API_KEY when no Claude OAuth token is present', async () => {
    const homeDir = createTempHome();
    const packageRoot = createPackageFixture(homeDir);
    const harness = createAgentLiteModuleHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      credentialEnv: {
        ANTHROPIC_API_KEY: 'test-anthropic-key',
      },
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveAgentLitePackageRoot: () => packageRoot,
    });

    await host.start();

    await expect(harness.capturedOptions()?.model?.credentials?.()).resolves.toEqual({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
    });
    expect(host.getSnapshot().runtimeInfo.message).toBe(
      'AgentLite is running with explicit Claude credentials.',
    );
  });

  it('starts without credentials and reports that replies will fail', async () => {
    const homeDir = createTempHome();
    const packageRoot = createPackageFixture(homeDir);
    const harness = createAgentLiteModuleHarness();

    tempDirs.push(homeDir);

    const host = new AgentLiteHost({
      credentialEnv: {},
      homeDir,
      loadAgentLiteModule: harness.loadAgentLiteModule,
      resolveAgentLitePackageRoot: () => packageRoot,
    });

    await host.start();

    await expect(harness.capturedOptions()?.model?.credentials?.()).resolves.toEqual({});
    expect(host.getSnapshot().runtimeInfo.message).toBe(
      'AgentLite is running without model credentials; replies will fail.',
    );
  });
});
