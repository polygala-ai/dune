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

  it('forwards scheduleItemAssignment and cancelItemAssignment to the active runtime service', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);
    const scheduleItemAssignment = vi.fn(async () => 'task-123');
    const cancelItemAssignment = vi.fn(async () => undefined);
    const mockRuntime = createMockAgentRuntime();
    mockRuntime.service.scheduleItemAssignment = scheduleItemAssignment;
    mockRuntime.service.cancelItemAssignment = cancelItemAssignment;
    const controller = new DesktopRuntimeController({
      agentStore: { get: async () => null, set: async () => {} },
      createRealRuntime: () => ({
        ...mockRuntime,
        start: async () => undefined,
      }),
      homeDir,
    });

    await controller.start();
    const taskId = await controller.scheduleItemAssignment('agent-1', 'item-1');
    await controller.cancelItemAssignment('agent-1', 'task-123');

    expect(scheduleItemAssignment).toHaveBeenCalledWith('agent-1', 'item-1');
    expect(cancelItemAssignment).toHaveBeenCalledWith('agent-1', 'task-123');
    expect(taskId).toBe('task-123');
  });

  it('emits item status changes only for review and acceptance transitions', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);
    const onItemStatusChange = vi.fn();
    const controller = new DesktopRuntimeController({
      agentStore: { get: async () => null, set: async () => {} },
      homeDir,
      onItemStatusChange,
    });

    controller.handleWorkflowSnapshotChange(
      {
        items: [
          { id: 'item-1', status: 'active', title: 'Alpha' },
          { id: 'item-2', status: 'review', title: 'Beta' },
        ],
      },
      {
        items: [
          { id: 'item-1', status: 'review', title: 'Alpha' },
          { id: 'item-2', status: 'done', title: 'Beta' },
          { id: 'item-3', status: 'acceptance', title: 'Gamma' },
        ],
      },
    );

    expect(onItemStatusChange).toHaveBeenCalledTimes(1);
    expect(onItemStatusChange).toHaveBeenCalledWith({
      itemId: 'item-1',
      nextStatus: 'review',
      previousStatus: 'active',
      title: 'Alpha',
    });
  });
});
