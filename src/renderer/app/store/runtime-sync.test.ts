import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';

describe('app store desktop runtime reconciliation', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('hydrates the store from a live desktop runtime snapshot', async () => {
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

    window.duneDesktop = {
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
      subscribe: vi.fn(() => () => undefined),
    };

    const { resetAppStore, useAppStore } = await import('@/renderer/app/store/use-app-store');

    await vi.waitFor(() => {
      expect(useAppStore.getState().telegramSetupSessions).toEqual([
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
      ]);
    });

    resetAppStore();
  });
});
