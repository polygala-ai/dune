export const workflowItemStatuses = [
  'inbox',
  'ready',
  'active',
  'review',
  'done',
] as const;

export const workflowTaskStatuses = [
  'todo',
  'doing',
  'blocked',
  'review',
  'done',
] as const;

export const workflowProjectViews = [
  'board',
  'agents',
  'activity',
] as const;

export const workflowProjectFilters = [
  'all',
  'assigned',
  'blocked',
  'review',
] as const;

export type WorkflowItemStatus = (typeof workflowItemStatuses)[number];
export type WorkflowTaskStatus = (typeof workflowTaskStatuses)[number];
export type WorkflowProjectView = (typeof workflowProjectViews)[number];
export type WorkflowProjectFilter = (typeof workflowProjectFilters)[number];
export type WorkflowProjectScreen = 'main' | 'settings';
export type WorkflowEventKind = 'assignment' | 'item' | 'note' | 'task';

export interface WorkflowProject {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  updatedAt: number;
}

export interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: WorkflowTaskStatus;
  title: string;
  updatedAt: number;
}

export interface WorkflowWorkProduct {
  body: string;
  createdAt: number;
  id: string;
  title: string;
}

export interface WorkflowEvent {
  createdAt: number;
  description: string;
  id: string;
  kind: WorkflowEventKind;
}

export interface WorkflowItem {
  brief: string;
  createdAt: number;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  sortOrder: number;
  status: WorkflowItemStatus;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

export interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: WorkflowProjectFilter;
  selectedProjectId: string | null;
  selectedProjectView: WorkflowProjectView;
}

export interface WorkflowItemSummary {
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
}
