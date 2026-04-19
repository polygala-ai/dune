// Workflow feature types.

/** Workflow item statuses constant. */
export const workflowItemStatuses = [
  'inbox',
  'ready',
  'active',
  'review',
  'acceptance',
  'done',
] as const;

/** Workflow task statuses constant. */
export const workflowTaskStatuses = [
  'todo',
  'doing',
  'blocked',
  'review',
  'done',
] as const;

/** Workflow project views constant. */
export const workflowProjectViews = [
  'board',
  'agents',
  'activity',
] as const;

/** Workflow project filters constant. */
export const workflowProjectFilters = [
  'all',
  'assigned',
  'blocked',
  'review',
] as const;

/** Workflow item status. */
export type WorkflowItemStatus = (typeof workflowItemStatuses)[number];
/** Workflow task status. */
export type WorkflowTaskStatus = (typeof workflowTaskStatuses)[number];
/** Workflow project view shape. */
export type WorkflowProjectView = (typeof workflowProjectViews)[number];
/** Workflow project filter shape. */
export type WorkflowProjectFilter = (typeof workflowProjectFilters)[number];
/** Workflow project screen shape. */
export type WorkflowProjectScreen = 'main' | 'settings';
/** Workflow event kind shape. */
export type WorkflowEventKind = 'assignment' | 'feedback' | 'item' | 'note' | 'task';

/** Workflow project shape. */
export interface WorkflowProject {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  rootPath: string | null;
  updatedAt: number;
}

/** Workflow task shape. */
export interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: WorkflowTaskStatus;
  title: string;
  updatedAt: number;
}

/** Workflow work product shape. */
export interface WorkflowWorkProduct {
  body: string;
  createdAt: number;
  id: string;
  title: string;
}

/** Workflow event shape. */
export interface WorkflowEvent {
  actor?: string;
  createdAt: number;
  description: string;
  id: string;
  kind: WorkflowEventKind;
}

/** Workflow item activity summary shape. */
export interface WorkflowItemActivitySummary {
  archivedEventCount: number;
  hasOlderEvents: boolean;
  rollingSummary: string | null;
  totalEventCount: number;
}

/** Workflow project activity summary shape. */
export interface WorkflowProjectActivitySummary {
  archivedEntryCount: number;
  hasOlderEntries: boolean;
  rollingSummary: string | null;
  totalEntryCount: number;
}

/** Workflow project activity entry shape. */
export interface WorkflowProjectActivityEntry {
  actor?: string;
  createdAt: number;
  description: string;
  id: string;
  itemId: string;
  itemTitle: string;
}

/** Lazy workflow project activity page. */
export interface WorkflowProjectActivityPage {
  entries: WorkflowProjectActivityEntry[];
  hasOlderEntries: boolean;
  projectId: string;
  totalEntryCount: number;
}

/** Workflow item shape. */
export interface WorkflowItem {
  activity: WorkflowItemActivitySummary;
  artifactFolderName: string;
  brief: string;
  createdAt: number;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  scheduledTaskId: string | null;
  sortOrder: number;
  status: WorkflowItemStatus;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

/** Workflow snapshot. */
export interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: WorkflowProjectFilter;
  selectedProjectId: string | null;
  selectedProjectView: WorkflowProjectView;
}

/** Workflow item summary shape. */
export interface WorkflowItemSummary {
  brief: string;
  completedTaskCount: number;
  currentTaskTitle: string | null;
  hasBlockedTasks: boolean;
  id: string;
  isAgentWorking: boolean;
  primaryAgentId: string | null;
  primaryAgentName: string | null;
  specialStateLabel: string | null;
  status: WorkflowItemStatus;
  statusLabel: string;
  title: string;
  totalTaskCount: number;
  updatedLabel: string;
}
