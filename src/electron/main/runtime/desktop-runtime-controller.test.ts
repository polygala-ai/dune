// Desktop runtime controller tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
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
      agentStore: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      createRealRuntime: () => ({
        ...createMockAgentRuntime(),
        start: () => Promise.reject(new Error('BoxLite unavailable')),
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
      agentStore: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      createRealRuntime: () => ({
        ...createMockAgentRuntime(),
        shutdown,
        start: () => Promise.resolve(),
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
    const scheduleItemAssignment = vi.fn(() => Promise.resolve('task-123'));
    const cancelItemAssignment = vi.fn(() => Promise.resolve());
    const mockRuntime = createMockAgentRuntime();
    mockRuntime.service.scheduleItemAssignment = scheduleItemAssignment;
    mockRuntime.service.cancelItemAssignment = cancelItemAssignment;
    const controller = new DesktopRuntimeController({
      agentStore: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      createRealRuntime: () => ({
        ...mockRuntime,
        start: () => Promise.resolve(),
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

  it('collects the full conversation transcript across paged transcript reads', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-controller-home-'));
    tempDirs.push(homeDir);
    const mockRuntime = createMockAgentRuntime();
    const agentId = 'agent-1';
    const getTranscriptPage = vi.fn((
      _agentId: string,
      options?: { beforeMessageId?: string | null; limit?: number },
    ) => {
      if (options?.beforeMessageId === 'message-3') {
        return Promise.resolve({
          agentId,
          hasOlderMessages: false,
          messages: [
            {
              attachments: [],
              content: 'First message',
              createdAt: 1,
              format: 'plain' as const,
              id: 'message-1',
              role: 'user' as const,
              status: 'complete' as const,
            },
            {
              attachments: [],
              content: 'Second message',
              createdAt: 2,
              format: 'markdown' as const,
              id: 'message-2',
              role: 'assistant' as const,
              status: 'complete' as const,
            },
          ],
          totalMessageCount: 4,
        });
      }

      return Promise.resolve({
        agentId,
        hasOlderMessages: true,
        messages: [
          {
            attachments: [],
            content: 'Third message',
            createdAt: 3,
            format: 'plain' as const,
            id: 'message-3',
            role: 'user' as const,
            status: 'complete' as const,
          },
          {
            attachments: [],
            content: 'Fourth message',
            createdAt: 4,
            format: 'markdown' as const,
            id: 'message-4',
            role: 'assistant' as const,
            status: 'complete' as const,
          },
        ],
        totalMessageCount: 4,
      });
    });
    const runtimeSnapshot: AgentServiceSnapshot = {
      agents: [
        {
          activityEvents: [],
          channel: {
            canCompose: true,
            id: 'dune-chat',
            kind: 'built-in',
            label: 'Dune chat',
            status: 'ready',
          },
          codingEngineEvents: [],
          contextCards: [],
          definition: {
            archetype: 'custom',
            responsibilities: [],
          },
          id: agentId,
          messages: [],
          name: 'Navigator',
          note: 'Test agent',
          preview: 'Ready',
          projectId: null,
          status: 'ready',
          telegram: null,
          transcript: {
            archivedMessageCount: 0,
            hasOlderMessages: true,
            rollingSummary: null,
            totalMessageCount: 4,
          },
          updatedAt: 4,
          workspace: 'Mock agent',
        },
      ],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: {
        mode: 'mock-fallback',
        status: 'ready',
      },
      selectedAgentId: agentId,
      telegramSetupSessions: [],
    };
    const controller = new DesktopRuntimeController({
      agentStore: {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
      },
      createRealRuntime: () => ({
        getSnapshot: () => runtimeSnapshot,
        reset: () => undefined,
        service: {
          ...mockRuntime.service,
          getTranscriptPage,
          listAgents: () => runtimeSnapshot.agents.map((agent) => ({ ...agent })),
        },
        start: () => Promise.resolve(),
        subscribe: () => () => undefined,
      }),
      homeDir,
    });

    await controller.start();

    const conversation = await controller.getConversationMessages(agentId);

    expect(conversation.groupId).toBe(agentId);
    expect(conversation.groupName).toBe('Navigator');
    expect(conversation.messages.map((message) => message.id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
      'message-4',
    ]);
    expect(getTranscriptPage).toHaveBeenCalledTimes(2);
    expect(getTranscriptPage).toHaveBeenNthCalledWith(1, agentId, { limit: 200 });
    expect(getTranscriptPage).toHaveBeenNthCalledWith(2, agentId, {
      beforeMessageId: 'message-3',
      limit: 200,
    });
  });
});
