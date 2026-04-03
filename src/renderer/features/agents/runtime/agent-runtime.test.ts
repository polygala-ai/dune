import { describe, expect, it, vi } from 'vitest';

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

  it('resets runtime state cleanly', async () => {
    const runtime = createMockAgentRuntime();

    await runtime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    runtime.reset();

    expect(runtime.getSnapshot()).toEqual({
      agents: [],
      isStreaming: false,
      runtimeInfo: {
        message: 'AgentLite is unavailable, so Dune is using the mock runtime.',
        mode: 'mock-fallback',
        status: 'ready',
      },
      selectedAgentId: null,
    });
  });
});
