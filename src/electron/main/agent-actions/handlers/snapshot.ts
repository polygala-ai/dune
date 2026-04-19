// Agent IPC snapshot tool handlers.

import { createId } from '@/shared/id';
import {
  createArtifactFolderName,
  normalizeProjectRootPath,
} from '@/shared/workflow/project-artifacts';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';
import { normalizeDependencyIds } from '@/shared/workflow/dependency-utils';
import type { AppStorage } from '@/electron/main/storage/app-storage';

import { ToolHandlerError } from './types';

/** Workflow item statuses constant. */
export const workflowItemStatuses = ['inbox', 'ready', 'active', 'review', 'acceptance', 'done'] as const;
/** Workflow item status. */
export type WorkflowItemStatus = (typeof workflowItemStatuses)[number];

/** Workflow snapshot. */
export interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: string;
  selectedProjectId: string | null;
  selectedProjectView: string;
}

/** Workflow item shape. */
export interface WorkflowItem {
  activity: {
    archivedEventCount: number;
    hasOlderEvents: boolean;
    rollingSummary: string | null;
    totalEventCount: number;
  };
  artifactFolderName: string;
  brief: string;
  createdAt: number;
  dependsOn?: string[] | undefined;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  scheduledTaskId: string | null;
  sortOrder: number;
  status: string;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

/** Workflow task shape. */
export interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: string;
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
  kind: string;
}

/** Prepends workflow events while preserving the input order. */
export function prependWorkflowEvents(
  item: Pick<WorkflowItem, 'workflowEvents'>,
  events: WorkflowEvent[],
): void {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    item.workflowEvents.unshift(events[index]!);
  }
}

/** Records workflow item events and updates item/project timestamps. */
export function recordWorkflowItemEvents(
  snapshot: WorkflowSnapshot,
  item: WorkflowItem,
  events: WorkflowEvent[],
  updatedAt: number,
): void {
  const nextUpdatedAt = Math.max(item.updatedAt, updatedAt);

  prependWorkflowEvents(item, events);
  item.updatedAt = nextUpdatedAt;
  touchProject(snapshot, item.projectId, nextUpdatedAt);
}

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

/** Creates empty workflow snapshot. */
export function createEmptyWorkflowSnapshot(): WorkflowSnapshot {
  return {
    items: [],
    projects: [],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: null,
    selectedProjectView: 'board',
  };
}

/** Reads workflow snapshot. */
export async function readWorkflowSnapshot(store: AppStorage): Promise<WorkflowSnapshot> {
  const snapshot = await store.get<WorkflowSnapshot>('snapshot');

  return snapshot ? cloneWorkflowSnapshot(snapshot) : createEmptyWorkflowSnapshot();
}

/** Writes workflow snapshot. */
export async function writeWorkflowSnapshot(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  onWorkflowChanged: () => void,
): Promise<void> {
  normalizeWorkflowSnapshot(snapshot);
  await store.set('snapshot', snapshot);
  onWorkflowChanged();
}

/** Clones workflow snapshot. */
export function cloneWorkflowSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    items: snapshot.items.map((item) => ({
      ...item,
      activity: createWorkflowItemActivitySummary(item.activity),
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : createArtifactFolderName(item.title, item.id),
      ...(normalizeDependencyIds(item.dependsOn)
        ? { dependsOn: normalizeDependencyIds(item.dependsOn) }
        : {}),
      scheduledTaskId: item.scheduledTaskId ?? null,
      tasks: item.tasks.map((task) => ({ ...task })),
      workProducts: item.workProducts.map((workProduct) => ({ ...workProduct })),
      workflowEvents: item.workflowEvents.map((event) => ({ ...event })),
    })),
    projects: snapshot.projects.map((project) => ({
      ...project,
      rootPath: normalizeProjectRootPath(project.rootPath),
    })),
    selectedItemId: snapshot.selectedItemId,
    selectedProjectFilter: snapshot.selectedProjectFilter,
    selectedProjectId: snapshot.selectedProjectId,
    selectedProjectView: snapshot.selectedProjectView,
  };
}

/** Normalizes workflow snapshot. */
export function normalizeWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
  for (const project of snapshot.projects) {
    project.rootPath = normalizeProjectRootPath(project.rootPath);
  }

  for (const item of snapshot.items) {
    item.activity = createWorkflowItemActivitySummary(item.activity);
    item.status = isWorkflowItemStatus(item.status) ? item.status : 'inbox';
    item.artifactFolderName =
      typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
        ? item.artifactFolderName.trim()
        : createArtifactFolderName(item.title, item.id);
    const normalizedDependencyIds = normalizeDependencyIds(item.dependsOn);

    if (normalizedDependencyIds) {
      item.dependsOn = normalizedDependencyIds;
    } else {
      delete item.dependsOn;
    }
  }

  for (const project of snapshot.projects) {
    const statuses = new Set(
      snapshot.items
        .filter((item) => item.projectId === project.id)
        .map((item) => item.status),
    );

    for (const status of statuses) {
      reindexProjectStatusGroup(snapshot.items, project.id, status);
    }
  }

  if (snapshot.selectedProjectId && !snapshot.projects.some((project) => project.id === snapshot.selectedProjectId)) {
    snapshot.selectedProjectId = snapshot.projects[0]?.id ?? null;
  }

  if (
    snapshot.selectedItemId &&
    !snapshot.items.some((item) => item.id === snapshot.selectedItemId)
  ) {
    snapshot.selectedItemId = null;
  }

  if (!snapshot.selectedProjectFilter) {
    snapshot.selectedProjectFilter = 'all';
  }

  if (!snapshot.selectedProjectView) {
    snapshot.selectedProjectView = 'board';
  }
}

/** Returns whether the value is a workflow item status. */
export function isWorkflowItemStatus(value: string): value is WorkflowItemStatus {
  return workflowItemStatuses.includes(value as WorkflowItemStatus);
}

/** Compares items. */
export function compareItems(left: WorkflowItem, right: WorkflowItem): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

/** Reindexes project status group. */
export function reindexProjectStatusGroup(
  items: WorkflowItem[],
  projectId: string,
  status: string,
): void {
  items
    .filter((item) => item.projectId === projectId && item.status === status)
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.updatedAt - right.updatedAt
        : left.sortOrder - right.sortOrder,
    )
    .forEach((item, index) => {
      item.sortOrder = index;
    });
}

/** Creates workflow event. */
export function createWorkflowEvent(
  kind: string,
  description: string,
  createdAt: number,
  actor?: string,
): WorkflowEvent {
  const event: WorkflowEvent = {
    createdAt,
    description,
    id: createId('event'),
    kind,
  };

  if (actor) {
    event.actor = actor;
  }

  return event;
}

/** Touches project. */
export function touchProject(snapshot: WorkflowSnapshot, projectId: string, updatedAt: number): void {
  for (const project of snapshot.projects) {
    if (project.id === projectId) {
      project.updatedAt = updatedAt;
    }
  }
}

/** Finds item. */
export function findItem(snapshot: WorkflowSnapshot, itemId: string): WorkflowItem {
  const item = snapshot.items.find((candidate) => candidate.id === itemId) ?? null;

  if (!item) {
    throw new ToolHandlerError('not-found', `Item ${itemId} not found.`);
  }

  return item;
}
