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
    isStreaming: snapshot.isStreaming,
    runtimeInfo: snapshot.runtimeInfo,
    selectedAgentId: snapshot.selectedAgentId,
  };
}

export function createAgentSlice(initialState: AgentState): AppStoreSlice<AgentSlice> {
  return (set) => ({
    ...initialState,
    setAgentsSnapshot: ({
      agents,
      isStreaming,
      runtimeInfo,
      selectedAgentId,
    }) => {
      set({
        agents,
        isStreaming,
        runtimeInfo,
        selectedAgentId,
      });
    },
    setDraft: (draft) => {
      set({ draft });
    },
  });
}
