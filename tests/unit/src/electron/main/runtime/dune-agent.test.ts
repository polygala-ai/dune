// Dune agent tests.

import type {
  Agent as AgentLiteAgent,
  AgentLite,
  AgentOptions,
} from '@boxlite-ai/agentlite';
import { describe, expect, it, vi } from 'vitest';

import { DuneAgent, type DuneAcpOptions } from '@/electron/main/runtime/dune-agent';

/** Creates mock agent. */
function createMockAgent(): AgentLiteAgent {
  return {
    getBackend: vi.fn(() => ({ type: 'claudeCode' })),
    registerGroup: vi.fn(async () => {}),
    setBackend: vi.fn(async (backend) => ({
      applies: 'nextTurn' as const,
      current: backend,
      handoff: 'skipped' as const,
      previous: { type: 'claudeCode' as const },
    })),
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

  it('passes ACP peer configuration through to AgentLite', async () => {
    const agent = createMockAgent();
    const getOrCreateAgent = vi.fn((_name: string, _options?: AgentOptions) => agent);
    const acp = {
      peers: [
        {
          name: 'codex',
          command: 'npx',
          args: ['-y', '@zed-industries/codex-acp'],
          description: 'Codex via ACP',
        },
      ],
    } satisfies DuneAcpOptions;

    const duneAgent = new DuneAgent({
      acp,
      agentLite: {
        agents: new Map(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(async () => {}),
        getOrCreateAgent,
        stop: vi.fn(async () => {}),
      } as unknown as AgentLite,
      credentials: async () => ({}),
      groupFolder: 'stilgar-PNDOmbNq',
      name: 'Stilgar',
      onOutboundMessage: vi.fn(),
      primaryChatJid: 'dune:agent:PNDOmbNq',
    });

    await duneAgent.start();

    const [, runtimeOptions] = getOrCreateAgent.mock.calls[0] as [string, AgentOptions & {
      acp?: DuneAcpOptions;
    }];
    expect(runtimeOptions.acp).toEqual(acp);
  });

  it('applies the configured AgentLite backend after getting the persisted agent', async () => {
    const agent = createMockAgent();
    const getOrCreateAgent = vi.fn((_name: string, _options?: AgentOptions) => agent);

    const duneAgent = new DuneAgent({
      agentLite: {
        agents: new Map(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(async () => {}),
        getOrCreateAgent,
        stop: vi.fn(async () => {}),
      } as unknown as AgentLite,
      backend: { type: 'codex' },
      credentials: async () => ({}),
      groupFolder: 'stilgar-PNDOmbNq',
      name: 'Stilgar',
      onOutboundMessage: vi.fn(),
      primaryChatJid: 'dune:agent:PNDOmbNq',
    });

    await duneAgent.start();

    const [, runtimeOptions] = getOrCreateAgent.mock.calls[0] as [string, AgentOptions];
    expect(runtimeOptions.backend).toBeUndefined();
    expect(agent.setBackend).toHaveBeenCalledWith({ type: 'codex' }, { context: 'fresh' });
    expect(agent.start).toHaveBeenCalledTimes(1);
  });
});
