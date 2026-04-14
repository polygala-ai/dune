import type {
  Agent as AgentLiteAgent,
  AgentLite,
  AgentOptions,
} from '@boxlite-ai/agentlite';
import { describe, expect, it, vi } from 'vitest';

import { DuneAgent } from './dune-agent';

function createMockAgent(): AgentLiteAgent {
  return {
    registerGroup: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
  } as unknown as AgentLiteAgent;
}

describe('DuneAgent', () => {
  it('uses getOrCreateAgent so persisted AgentLite agents can be reused', async () => {
    const agent = createMockAgent();
    const createAgent = vi.fn(() => {
      throw new Error('DuneAgent should not call createAgent');
    });
    const getOrCreateAgent = vi.fn((_name: string, _options?: AgentOptions) => agent);
    const duneAgent = new DuneAgent({
      agentLite: {
        agents: new Map(),
        createAgent,
        deleteAgent: vi.fn(async () => {}),
        getOrCreateAgent,
        stop: vi.fn(async () => {}),
      } as unknown as AgentLite,
      credentials: async () => ({ OPENAI_API_KEY: 'test' }),
      groupFolder: 'stilgar-PNDOmbNq',
      name: 'Stilgar',
      onOutboundMessage: vi.fn(),
      primaryChatJid: 'dune:agent:PNDOmbNq',
    });

    await duneAgent.start();

    expect(createAgent).not.toHaveBeenCalled();
    expect(getOrCreateAgent).toHaveBeenCalledTimes(1);

    const [groupFolder, runtimeOptions] = getOrCreateAgent.mock.calls[0] as [string, AgentOptions];
    expect(groupFolder).toBe('stilgar-PNDOmbNq');
    expect(runtimeOptions.name).toBe('Stilgar');
    expect(runtimeOptions.credentials).toBeTypeOf('function');
    expect(runtimeOptions.channels?.dune).toBeTypeOf('function');
    expect(agent.start).toHaveBeenCalledTimes(1);
    expect(agent.registerGroup).toHaveBeenCalledWith(
      'dune:agent:PNDOmbNq',
      expect.objectContaining({
        folder: 'main',
        isMain: true,
        name: 'Stilgar',
        trigger: '@Stilgar',
      }),
    );
  });
});
