// Desktop runtime controller tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import { resolveAgentLiteRuntimeRoot } from './agent-runtime';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { createMockAgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';

describe('DesktopRuntimeController', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('falls back to the mock runtime when AgentLite startup fails', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);

    const controller = new DesktopRuntimeController({
      agentStore: { get: async () => null, set: async () => {} },
      createRealRuntime: () => ({
        ...createMockAgentRuntime(),
        start: async () => {
          throw new Error('BoxLite unavailable');
        },
      }),
      homeDir,
    });

    await controller.start();

    expect(controller.getSnapshot()).toEqual({
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: {
        message:
          'AgentLite is unavailable, so Dune is using the mock runtime. Error: BoxLite unavailable',
        mode: 'mock-fallback',
        rootPath: resolveAgentLiteRuntimeRoot(homeDir),
        status: 'ready',
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    });

    await controller.shutdown();
  });

  it('runs shutdown at most once even when called repeatedly', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);
    let resolveShutdown!: () => void;
    const shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveShutdown = resolve;
        }),
    );
    const controller = new DesktopRuntimeController({
      agentStore: { get: async () => null, set: async () => {} },
      createRealRuntime: () => ({
        ...createMockAgentRuntime(),
        shutdown,
        start: async () => undefined,
      }),
      homeDir,
    });

    await controller.start();

    const firstShutdown = controller.shutdown();
    const secondShutdown = controller.shutdown();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(firstShutdown).toBe(secondShutdown);

    resolveShutdown();
    await expect(firstShutdown).resolves.toBeUndefined();
    await expect(secondShutdown).resolves.toBeUndefined();
  });

  it('forwards ready-assignment inbox signals to the active runtime service', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);
    const signalReadyAssignmentInbox = vi.fn(async () => undefined);
    const mockRuntime = createMockAgentRuntime();
    mockRuntime.service.signalReadyAssignmentInbox = signalReadyAssignmentInbox;
    const controller = new DesktopRuntimeController({
      agentStore: { get: async () => null, set: async () => {} },
      createRealRuntime: () => ({
        ...mockRuntime,
        start: async () => undefined,
      }),
      homeDir,
    });

    await controller.start();
    await controller.signalReadyAssignmentInbox('agent-1', {
      generation: 4,
      itemCount: 2,
    });

    expect(signalReadyAssignmentInbox).toHaveBeenCalledWith('agent-1', {
      generation: 4,
      itemCount: 2,
    });
  });
});
