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
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProjectFilter,
  WorkflowProjectScreen,
  WorkflowProjectView,
  WorkflowProject,
  WorkflowSnapshot,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';

export type AppRoute = 'agent' | 'plugins' | 'settings' | 'workflow';

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

export interface WorkflowState extends WorkflowSnapshot {
  isWorkflowHydrated: boolean;
  selectedProjectScreen: WorkflowProjectScreen;
}

export interface WorkflowActions {
  addTask: (itemId: string, title: string) => string | null;
  addWorkProduct: (itemId: string, input: { body: string; title: string }) => string | null;
  assignPrimaryAgent: (
    itemId: string,
    input: { agentId: string | null; agentName?: string | null },
  ) => void;
  createItem: (
    input: {
      brief: string;
      projectId: string;
      status: WorkflowItemStatus;
      title: string;
    },
  ) => string | null;
  createProject: (
    input: {
      description: string;
      name: string;
    },
  ) => string | null;
  deleteProject: (projectId: string) => void;
  hydrateWorkflow: (snapshot: WorkflowSnapshot) => void;
  moveItem: (itemId: string, status: WorkflowItemStatus, index: number) => void;
  openProjectSettings: () => void;
  closeProjectSettings: () => void;
  selectItem: (itemId: string | null) => void;
  selectProjectFilter: (filter: WorkflowProjectFilter) => void;
  selectProject: (projectId: string | null) => void;
  selectProjectView: (view: WorkflowProjectView) => void;
  updateProject: (
    projectId: string,
    input: { description?: string; name?: string },
  ) => void;
  updateItem: (
    itemId: string,
    input: { brief?: string; title?: string },
  ) => void;
  updateTask: (
    itemId: string,
    taskId: string,
    input: { notes?: string; status?: WorkflowTaskStatus; title?: string },
  ) => void;
}

export type WorkflowSlice = WorkflowState & WorkflowActions;

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

export type AppStoreState = AgentState & SettingsState & WorkflowState & ShellState;
export type AppStore = AppStoreState &
  AgentActions &
  SettingsActions &
  WorkflowActions &
  ShellActions;
export type AppStoreSlice<T> = StateCreator<AppStore, [], [], T>;

export interface AgentSessionState {
  activeAgent: PresentedAgent | null;
  agentSummaries: AgentSummary[];
  commandAgents: Array<AgentSummary & { projectId: string | null; workspace: string }>;
  draft: string;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
}

export interface WorkflowSessionState {
  activityEntries: Array<{
    createdAt: number;
    createdAtLabel: string;
    description: string;
    id: string;
    itemId: string;
    itemTitle: string;
  }>;
  filteredItemSummaries: Array<{
    brief: string;
    completedTaskCount: number;
    hasBlockedTasks: boolean;
    id: string;
    primaryAgentId: string | null;
    primaryAgentName: string | null;
    specialStateLabel: string | null;
    status: WorkflowItemStatus;
    statusLabel: string;
    title: string;
    totalTaskCount: number;
    updatedLabel: string;
  }>;
  isWorkflowHydrated: boolean;
  items: WorkflowItem[];
  metrics: {
    activeCount: number;
    agentCount: number;
    blockedCount: number;
    reviewCount: number;
  };
  projects: WorkflowProject[];
  projectAgents: Array<AgentSummary & {
    currentItemId: string | null;
    currentItemTitle: string | null;
    projectId: string | null;
  }>;
  recentItems: Array<{
    id: string;
    specialStateLabel: string | null;
    title: string;
    updatedLabel: string;
  }>;
  selectedItem: (WorkflowItem & {
    primaryAgentName: string | null;
    workProducts: Array<{ body: string; createdAt: number; createdAtLabel: string; id: string; title: string }>;
    workflowEvents: Array<{ createdAt: number; createdAtLabel: string; description: string; id: string; kind: string }>;
  }) | null;
  selectedItemId: string | null;
  selectedProjectFilter: WorkflowProjectFilter;
  selectedProjectId: string | null;
  selectedProjectScreen: WorkflowProjectScreen;
  selectedProjectView: WorkflowProjectView;
  selectedProject: WorkflowProject | null;
}
