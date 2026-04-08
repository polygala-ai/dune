import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type {
  AgentState,
  AppStoreSlice,
  AgentSlice,
} from './types';

export function createInitialAgentState(snapshot: AgentServiceSnapshot): AgentState {
  return {
    agents: snapshot.agents,
    draft: '',
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
      set({
        agents,
        externalChannels,
        isStreaming,
        runtimeInfo,
        selectedAgentId,
        telegramSetupSessions,
      });
    },
    setDraft: (draft) => {
      set({ draft });
    },
  });
}
