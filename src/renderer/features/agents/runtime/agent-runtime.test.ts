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
      selectedAgentId: null,
    });
  });
});
