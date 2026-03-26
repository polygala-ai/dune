import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import {
  presentAgent,
  presentAgentSummary,
  selectAgentById,
} from '@/renderer/features/agents/model/agent-presenters';

export function useAgentSession() {
  const {
    agents,
    draft,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      draft: state.draft,
      isStreaming: state.isStreaming,
      runtimeInfo: state.runtimeInfo,
      selectedAgentId: state.selectedAgentId,
    })),
  );

  const activeAgent = selectAgentById(
    agents,
    selectedAgentId,
  );

  return {
    activeAgent: activeAgent
      ? presentAgent(activeAgent)
      : null,
    commandAgents: agents.map((agent) => ({
      ...presentAgentSummary(agent),
      workspace: agent.workspace,
    })),
    agentSummaries: agents.map((agent) =>
      presentAgentSummary(agent),
    ),
    draft,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
  };
}

export function useShellState() {
  return useAppStore(
    useShallow((state) => ({
      isCommandOpen: state.isCommandOpen,
      isContextPanelOpen: state.isContextPanelOpen,
      route: state.route,
    })),
  );
}

export function useSettingsState() {
  return useAppStore(
    useShallow((state) => ({
      runtimeInfo: state.runtimeInfo,
      settingsRoute: state.settingsRoute,
      themePreference: state.themePreference,
    })),
  );
}
