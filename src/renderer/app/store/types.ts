import type { StateCreator } from 'zustand';

import type {
  Agent,
  AgentRuntimeInfo,
  AgentSummary,
  PresentedAgent,
} from '@/renderer/features/agents/types';
import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

export type AppRoute = 'agent' | 'settings';

export interface AgentState {
  agents: Agent[];
  draft: string;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
}

export interface AgentActions {
  setAgentsSnapshot: (snapshot: AgentServiceSnapshot) => void;
  setDraft: (draft: string) => void;
}

export type AgentSlice = AgentState & AgentActions;

export interface SettingsState {
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

export interface SettingsActions {
  setSettingsRoute: (route: SettingsRoute) => void;
  setThemePreference: (preference: ThemePreference) => void;
}

export type SettingsSlice = SettingsState & SettingsActions;

export interface ShellState {
  isCommandOpen: boolean;
  isContextPanelOpen: boolean;
  route: AppRoute;
}

export interface ShellActions {
  setCommandOpen: (isOpen: boolean) => void;
  setContextPanelOpen: (isOpen: boolean) => void;
  setRoute: (route: AppRoute) => void;
}

export type ShellSlice = ShellState & ShellActions;

export type AppStoreState = AgentState & SettingsState & ShellState;
export type AppStore = AppStoreState & AgentActions & SettingsActions & ShellActions;
export type AppStoreSlice<T> = StateCreator<AppStore, [], [], T>;

export interface AgentSessionState {
  activeAgent: PresentedAgent | null;
  agentSummaries: AgentSummary[];
  commandAgents: Array<AgentSummary & { workspace: string }>;
  draft: string;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
}
