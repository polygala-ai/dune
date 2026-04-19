// Renderer store types.

import type { StateCreator } from 'zustand';

import type {
  Agent,
  AgentMessage,
  AgentTranscriptPage,
  CodingEngineStatus,
  ExternalChannelsState,
  AgentRuntimeInfo,
  AgentSummary,
  PresentedAgent,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import type { AgentCustomizationDraft } from '@/renderer/features/agents/model/agent-customization';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProjectActivitySummary,
  WorkflowProjectFilter,
  WorkflowProjectScreen,
  WorkflowProjectView,
  WorkflowProject,
  WorkflowSnapshot,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';

/** App route shape. */
export type AppRoute = 'agent' | 'plugins' | 'settings' | 'workflow';

/** Navigation snapshot. */
export interface NavigationSnapshot {
  route: AppRoute;
  selectedAgentId: string | null;
  selectedProjectId: string | null;
  selectedProjectScreen: WorkflowProjectScreen;
  selectedProjectView: WorkflowProjectView;
  settingsRoute: SettingsRoute;
}

/** Agent state. */
export interface AgentTranscriptCacheEntry {
  messages: AgentMessage[];
  totalMessageCount: number;
}

export interface AgentState {
  agents: Agent[];
  agentCustomizations: Record<string, AgentCustomizationDraft>;
  agentDrafts: Record<string, string>;
  agentTranscriptCache: Record<string, AgentTranscriptCacheEntry>;
  codingEngines: CodingEngineStatus[];
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
  telegramSetupSessions: TelegramSetupSession[];
}

/** Agent actions shape. */
export interface AgentActions {
  appendTranscriptPage: (page: AgentTranscriptPage) => void;
  resetAgentCustomization: (agentId: string) => void;
  setAgentsSnapshot: (snapshot: AgentServiceSnapshot) => void;
  setDraft: (agentId: string | null, draft: string) => void;
  upsertAgentCustomization: (
    agentId: string,
    customization: AgentCustomizationDraft,
  ) => void;
}

/** Agent slice shape. */
export type AgentSlice = AgentState & AgentActions;

/** Settings state. */
export interface SettingsState {
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

/** Settings actions shape. */
export interface SettingsActions {
  setSettingsRoute: (route: SettingsRoute) => void;
  setThemePreference: (preference: ThemePreference) => void;
}

/** Settings slice shape. */
export type SettingsSlice = SettingsState & SettingsActions;

/** Per-item runtime activity driven by AgentLite task.run.* events. */
export interface WorkflowItemActivity {
  isWorking: boolean;
}

/** Workflow state. */
export interface WorkflowState extends WorkflowSnapshot {
  isWorkflowHydrated: boolean;
  itemActivity: Record<string, WorkflowItemActivity>;
  selectedProjectScreen: WorkflowProjectScreen;
}

/** Workflow actions shape. */
export interface WorkflowActions {
  addTask: (itemId: string, title: string, note?: string) => string | null;
  addWorkProduct: (itemId: string, input: { body: string; note?: string; title: string }) => string | null;
  assignPrimaryAgent: (
    itemId: string,
    input: { agentId: string | null; agentName?: string | null; note?: string | null },
  ) => void;
  clearAgentAssignments: (agentId: string) => void;
  createItem: (
    input: {
      brief: string;
      note?: string;
      projectId: string;
      status: WorkflowItemStatus;
      taskTitles?: string[];
      title: string;
    },
  ) => string | null;
  createProject: (
    input: {
      description: string;
      name: string;
      rootPath: string | null;
    },
  ) => string | null;
  deleteProject: (projectId: string) => void;
  hydrateWorkflow: (snapshot: WorkflowSnapshot) => void;
  moveItem: (itemId: string, status: WorkflowItemStatus, index: number, note?: string) => void;
  openProjectSettings: () => void;
  closeProjectSettings: () => void;
  selectItem: (itemId: string | null) => void;
  selectProjectFilter: (filter: WorkflowProjectFilter) => void;
  selectProject: (projectId: string | null) => void;
  selectProjectView: (view: WorkflowProjectView) => void;
  updateProject: (
    projectId: string,
    input: { description?: string; name?: string; rootPath?: string | null },
  ) => void;
  updateItem: (
    itemId: string,
    input: { brief?: string; note?: string; title?: string },
  ) => void;
  updateTask: (
    itemId: string,
    taskId: string,
    input: { note?: string; notes?: string; status?: WorkflowTaskStatus; title?: string },
  ) => void;
  setItemActivity: (itemId: string, activity: WorkflowItemActivity) => void;
}

/** Workflow slice shape. */
export type WorkflowSlice = WorkflowState & WorkflowActions;

/** Shell state. */
export interface ShellState {
  isCommandOpen: boolean;
  isContextPanelOpen: boolean;
  navigationBackStack: NavigationSnapshot[];
  navigationForwardStack: NavigationSnapshot[];
  popoverAgentId: string | null;
  route: AppRoute;
}

/** Shell actions shape. */
export interface ShellActions {
  setCommandOpen: (isOpen: boolean) => void;
  setContextPanelOpen: (isOpen: boolean) => void;
  setPopoverAgentId: (agentId: string | null) => void;
  setRoute: (route: AppRoute) => void;
}

/** Shell slice shape. */
export type ShellSlice = ShellState & ShellActions;

/** App store state. */
export type AppStoreState = AgentState & SettingsState & WorkflowState & ShellState;
/** App store contract. */
export type AppStore = AppStoreState &
  AgentActions &
  SettingsActions &
  WorkflowActions &
  ShellActions;
/** App store slice shape. */
export type AppStoreSlice<T> = StateCreator<AppStore, [], [], T>;

/** Agent session state. */
export interface AgentSessionState {
  activeAgent: PresentedAgent | null;
  activeAgentCustomization: AgentCustomizationDraft | null;
  agentSummaries: AgentSummary[];
  commandAgents: Array<AgentSummary & { projectId: string | null; workspace: string }>;
  draft: string;
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
  telegramSetupSessions: TelegramSetupSession[];
}

/** Workflow session state. */
export interface WorkflowSessionState {
  activityEntries: Array<{
    actor?: string;
    createdAt: number;
    createdAtLabel: string;
    description: string;
    id: string;
    itemId: string;
    itemTitle: string;
  }>;
  activitySummary: WorkflowProjectActivitySummary;
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
    isProjectMain: boolean;
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
