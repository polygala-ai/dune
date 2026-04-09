import { create } from 'zustand';

import {
  createAgentSlice,
  createInitialAgentState,
} from '@/renderer/app/store/agent-slice';
import {
  createInitialSettingsState,
  createSettingsSlice,
} from '@/renderer/app/store/settings-slice';
import {
  createInitialWorkflowState,
  createWorkflowSlice,
} from '@/renderer/app/store/workflow-slice';
import {
  createInitialShellState,
  createShellSlice,
} from '@/renderer/app/store/shell-slice';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

import type {
  AppStore,
  AppStoreState,
} from './types';

function createInitialState(): AppStoreState {
  const agentState = createInitialAgentState(agentRuntime.getSnapshot());

  return {
    ...agentState,
    ...createInitialShellState(),
    ...createInitialSettingsState(),
    ...createInitialWorkflowState(),
  };
}

export const useAppStore = create<AppStore>((set, get, store) => {
  const initialState = createInitialState();

  return {
    ...createAgentSlice({
      agents: initialState.agents,
      agentDrafts: initialState.agentDrafts,
      externalChannels: initialState.externalChannels,
      isStreaming: initialState.isStreaming,
      runtimeInfo: initialState.runtimeInfo,
      selectedAgentId: initialState.selectedAgentId,
      telegramSetupSessions: initialState.telegramSetupSessions,
    })(set, get, store),
    ...createShellSlice({
      isCommandOpen: initialState.isCommandOpen,
      isContextPanelOpen: initialState.isContextPanelOpen,
      navigationBackStack: initialState.navigationBackStack,
      navigationForwardStack: initialState.navigationForwardStack,
      route: initialState.route,
    })(set, get, store),
    ...createSettingsSlice({
      settingsRoute: initialState.settingsRoute,
      themePreference: initialState.themePreference,
    })(set, get, store),
    ...createWorkflowSlice({
      isWorkflowHydrated: initialState.isWorkflowHydrated,
      items: initialState.items,
      projects: initialState.projects,
      selectedItemId: initialState.selectedItemId,
      selectedProjectFilter: initialState.selectedProjectFilter,
      selectedProjectId: initialState.selectedProjectId,
      selectedProjectScreen: initialState.selectedProjectScreen,
      selectedProjectView: initialState.selectedProjectView,
    })(set, get, store),
  };
});

agentRuntime.subscribe((snapshot) => {
  useAppStore.getState().setAgentsSnapshot(snapshot);
});

export function resetAppStore() {
  agentRuntime.reset();
  useAppStore.setState(createInitialState());
}
