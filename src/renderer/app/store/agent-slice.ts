import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type {
  AgentState,
  AppStoreSlice,
  AgentSlice,
} from './types';

export function createInitialAgentState(snapshot: AgentServiceSnapshot): AgentState {
  return {
    agents: snapshot.agents,
    agentDrafts: {},
    externalChannels: snapshot.externalChannels,
    isStreaming: snapshot.isStreaming,
    runtimeInfo: snapshot.runtimeInfo,
    selectedAgentId: snapshot.selectedAgentId,
    telegramSetupSessions: snapshot.telegramSetupSessions,
  };
}

export function createAgentSlice(initialState: AgentState): AppStoreSlice<AgentSlice> {
  return (set) => ({
    ...initialState,
    setAgentsSnapshot: ({
      agents,
      externalChannels,
      isStreaming,
      runtimeInfo,
      selectedAgentId,
      telegramSetupSessions,
    }) => {
      set((state) => {
        const nextAgentIds = new Set(agents.map((agent) => agent.id));
        const nextAgentDrafts = Object.fromEntries(
          Object.entries(state.agentDrafts).filter(([agentId]) => nextAgentIds.has(agentId)),
        );

        return {
          agentDrafts: nextAgentDrafts,
          agents,
          externalChannels,
          isStreaming,
          runtimeInfo,
          selectedAgentId,
          telegramSetupSessions,
        };
      });
    },
    setDraft: (agentId, draft) => {
      if (!agentId) {
        return;
      }

      set((state) => {
        if (!state.agents.some((agent) => agent.id === agentId)) {
          return {};
        }

        const nextAgentDrafts = { ...state.agentDrafts };

        if (draft) {
          nextAgentDrafts[agentId] = draft;
        } else {
          delete nextAgentDrafts[agentId];
        }

        return { agentDrafts: nextAgentDrafts };
      });
    },
  });
}
