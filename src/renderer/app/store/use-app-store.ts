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
  };
}

export const useAppStore = create<AppStore>((set, get, store) => {
  const initialState = createInitialState();

  return {
    ...createAgentSlice({
      agents: initialState.agents,
      draft: initialState.draft,
      isStreaming: initialState.isStreaming,
      selectedAgentId: initialState.selectedAgentId,
    })(set, get, store),
    ...createShellSlice({
      isCommandOpen: initialState.isCommandOpen,
      isContextPanelOpen: initialState.isContextPanelOpen,
      route: initialState.route,
    })(set, get, store),
    ...createSettingsSlice({
      settingsRoute: initialState.settingsRoute,
      themePreference: initialState.themePreference,
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
