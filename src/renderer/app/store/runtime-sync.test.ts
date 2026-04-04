import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';

describe('app store desktop runtime reconciliation', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('hydrates the store from a live desktop runtime snapshot', async () => {
    const liveSnapshot: AgentServiceSnapshot = {
      agents: [],
      externalChannels: {
        telegram: {
          botUsername: 'agentlite_test_bot',
          configured: true,
          discoveredChats: [
            {
              channelId: 'telegram',
              jid: 'tg:123',
              kind: 'dm',
              lastSeenAt: 1,
              name: 'HashG',
            },
          ],
          errorMessage: null,
          status: 'connected',
        },
      },
      isStreaming: false,
      runtimeInfo: {
        mode: 'real',
        status: 'ready',
      },
      selectedAgentId: null,
    };

    window.duneDesktop = {
      createAgent: vi.fn(async () => 'agent-1'),
      deleteAgent: vi.fn(async () => undefined),
      getRuntimeSnapshot: vi.fn(async () => liveSnapshot),
      platform: 'darwin',
      selectAgent: vi.fn(async () => undefined),
      sendAgentMessage: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    };

    const { resetAppStore, useAppStore } = await import('@/renderer/app/store/use-app-store');

    await vi.waitFor(() => {
      expect(useAppStore.getState().externalChannels.telegram).toMatchObject({
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [
          {
            channelId: 'telegram',
            jid: 'tg:123',
            kind: 'dm',
            lastSeenAt: 1,
            name: 'HashG',
          },
        ],
        status: 'connected',
      });
    });

    resetAppStore();
  });
});
