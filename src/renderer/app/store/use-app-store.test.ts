import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore, resetAppStore } from '@/renderer/app/store/use-app-store';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

describe('app store agent runtime sync', () => {
  beforeEach(() => {
    resetAppStore();
  });

  it('syncs runtime snapshots into the store through the slice action', async () => {
    const agentId = await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });

    expect(useAppStore.getState().agents[0]?.id).toBe(agentId);
    expect(useAppStore.getState().selectedAgentId).toBe(agentId);
  });

  it('clears runtime and local draft state on reset', async () => {
    await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
    });
    useAppStore.getState().setDraft('Pending note');

    resetAppStore();

    expect(useAppStore.getState().agents).toEqual([]);
    expect(useAppStore.getState().selectedAgentId).toBeNull();
    expect(useAppStore.getState().draft).toBe('');
    expect(agentRuntime.getSnapshot()).toEqual({
      agents: [],
      externalChannels: createDefaultExternalChannelsState(),
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
