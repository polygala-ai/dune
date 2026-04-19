// Renderer agent runtime tests.

import { describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { createAgentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { createMockAgentRuntime } from '@/renderer/features/agents/services/mock-agent-service';

describe('agent runtime', () => {
  it('exposes the agent service contract and notifies subscribers', async () => {
    const runtime = createMockAgentRuntime();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    const agentId = await runtime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    runtime.service.selectAgent(agentId);

    expect(runtime.service.listAgents()).toHaveLength(1);
    expect(runtime.getSnapshot().selectedAgentId).toBe(agentId);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it('keeps unrelated streams alive when deleting another agent', async () => {
    vi.useFakeTimers();

    try {
      const runtime = createMockAgentRuntime();
      const firstAgentId = await runtime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
      const secondAgentId = await runtime.service.createAgent({
        channelId: 'dune-chat',
        name: 'QA triage',
      });
      const sendPromise = runtime.service.sendMessage(firstAgentId, 'Help with the next agent pass.');

      expect(runtime.getSnapshot().isStreaming).toBe(true);

      await runtime.service.deleteAgent(secondAgentId);

      expect(runtime.getSnapshot().agents.map((agent) => agent.id)).toEqual([firstAgentId]);
      expect(runtime.getSnapshot().isStreaming).toBe(true);

      await vi.runAllTimersAsync();
      await sendPromise;

      const nextSnapshot = runtime.getSnapshot();
      const firstAgent = nextSnapshot.agents[0];

      expect(nextSnapshot.isStreaming).toBe(false);
      expect(firstAgent?.messages.at(-1)?.role).toBe('assistant');
      expect(firstAgent?.messages.at(-1)?.status).toBe('complete');
      expect(firstAgent?.messages.at(-1)?.content.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows different agents to stream concurrently', async () => {
    vi.useFakeTimers();

    try {
      const runtime = createMockAgentRuntime();
      const firstAgentId = await runtime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
      const secondAgentId = await runtime.service.createAgent({
        channelId: 'dune-chat',
        name: 'QA triage',
      });
      const firstSendPromise = runtime.service.sendMessage(firstAgentId, 'Handle the nav pass.');
      const secondSendPromise = runtime.service.sendMessage(secondAgentId, 'Handle the QA pass.');

      const streamingSnapshot = runtime.getSnapshot();
      const firstAgent = streamingSnapshot.agents.find((agent) => agent.id === firstAgentId);
      const secondAgent = streamingSnapshot.agents.find((agent) => agent.id === secondAgentId);

      expect(streamingSnapshot.isStreaming).toBe(true);
      expect(firstAgent?.messages.at(-1)?.status).toBe('streaming');
      expect(secondAgent?.messages.at(-1)?.status).toBe('streaming');

      await vi.runAllTimersAsync();
      await Promise.all([firstSendPromise, secondSendPromise]);

      const nextSnapshot = runtime.getSnapshot();

      expect(nextSnapshot.isStreaming).toBe(false);
      expect(
        nextSnapshot.agents.find((agent) => agent.id === firstAgentId)?.messages.at(-1)?.status,
      ).toBe('complete');
      expect(
        nextSnapshot.agents.find((agent) => agent.id === secondAgentId)?.messages.at(-1)?.status,
      ).toBe('complete');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a second send while the same agent is already streaming', async () => {
    vi.useFakeTimers();

    try {
      const runtime = createMockAgentRuntime();
      const agentId = await runtime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
      });
      const firstSendPromise = runtime.service.sendMessage(agentId, 'First pass.');

      await runtime.service.sendMessage(agentId, 'Second pass.');
      await vi.runAllTimersAsync();
      await firstSendPromise;

      const agent = runtime.getSnapshot().agents.find((item) => item.id === agentId);

      expect(agent?.messages.map((message) => message.content)).toEqual([
        'First pass.',
        expect.any(String),
      ]);
      expect(agent?.messages.at(-1)?.status).toBe('complete');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets runtime state cleanly', async () => {
    const runtime = createMockAgentRuntime();

    await runtime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    runtime.reset();

    expect(runtime.getSnapshot()).toEqual({
      agents: [],
      codingEngines: [],
      externalChannels: createDefaultExternalChannelsState(),
      isStreaming: false,
      runtimeInfo: {
        message: 'AgentLite is unavailable, so Dune is using the mock runtime.',
        mode: 'mock-fallback',
        status: 'ready',
      },
      selectedAgentId: null,
      telegramSetupSessions: [],
    });
  });

  it('reconciles a stale desktop snapshot with the live runtime state', async () => {
    const liveSnapshot: AgentServiceSnapshot = {
      agents: [],
      codingEngines: [],
      externalChannels: {},
      isStreaming: false,
      runtimeInfo: {
        mode: 'real',
        status: 'ready',
      },
      selectedAgentId: null,
      telegramSetupSessions: [
        {
          agentId: null,
          botUsername: 'agentlite_test_bot',
          errorMessage: null,
          id: 'telegram-session-1',
          matchedChat: null,
          pairCode: 'PAIR42',
          pairExpiresAt: 1,
          pairingStatus: 'listening',
          status: 'connected',
        },
      ],
    };

    const runtime = createAgentRuntime({
      cancelTelegramSetupSession: vi.fn(async () => undefined),
      createAgent: vi.fn(async () => 'agent-1'),
      deleteAgent: vi.fn(async () => undefined),
      ensureProjectMainAgent: vi.fn(async () => 'agent-project-main'),
      getRuntimeSnapshot: vi.fn(async () => liveSnapshot),
      getTelegramSetupSession: vi.fn(async () => liveSnapshot.telegramSetupSessions[0] ?? null),
      platform: 'darwin',
      selectAgent: vi.fn(async () => undefined),
      sendAgentMessage: vi.fn(async () => undefined),
      startTelegramSetupSession: vi.fn(async () => 'telegram-session-1'),
      updateAgentChannel: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    });

    await vi.waitFor(() => {
      expect(runtime.getSnapshot().telegramSetupSessions).toEqual([
        expect.objectContaining({
          botUsername: 'agentlite_test_bot',
          id: 'telegram-session-1',
          pairingStatus: 'listening',
          status: 'connected',
        }),
      ]);
    });
  });
});
