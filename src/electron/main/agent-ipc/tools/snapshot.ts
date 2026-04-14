import { createId } from '@/shared/id';
import {
  createArtifactFolderName,
  normalizeProjectRootPath,
} from '@/shared/workflow/project-artifacts';
import type { AppStorage } from '@/electron/main/storage/app-storage';

import { ToolHandlerError } from './types';

export const workflowItemStatuses = ['inbox', 'ready', 'active', 'review', 'done'] as const;
export type WorkflowItemStatus = (typeof workflowItemStatuses)[number];

export interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: string;
  selectedProjectId: string | null;
  selectedProjectView: string;
}

export interface WorkflowItem {
  artifactFolderName: string;
  brief: string;
  createdAt: number;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  sortOrder: number;
  status: string;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

export interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: string;
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
  actor?: string;
  createdAt: number;
  description: string;
  id: string;
  kind: string;
}

export interface WorkflowProject {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  rootPath: string | null;
  updatedAt: number;
}

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

export async function readWorkflowSnapshot(store: AppStorage): Promise<WorkflowSnapshot> {
  const snapshot = await store.get<WorkflowSnapshot>('snapshot');

  return snapshot ? cloneWorkflowSnapshot(snapshot) : createEmptyWorkflowSnapshot();
}

export async function writeWorkflowSnapshot(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  onWorkflowChanged: () => void,
): Promise<void> {
  normalizeWorkflowSnapshot(snapshot);
  await store.set('snapshot', snapshot);
  onWorkflowChanged();
}

export function cloneWorkflowSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    items: snapshot.items.map((item) => ({
      ...item,
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : createArtifactFolderName(item.title, item.id),
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

export function normalizeWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
  for (const project of snapshot.projects) {
    project.rootPath = normalizeProjectRootPath(project.rootPath);
  }

  for (const item of snapshot.items) {
    item.status = isWorkflowItemStatus(item.status) ? item.status : 'inbox';
    item.artifactFolderName =
      typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
        ? item.artifactFolderName.trim()
        : createArtifactFolderName(item.title, item.id);
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

export function isWorkflowItemStatus(value: string): value is WorkflowItemStatus {
  return workflowItemStatuses.includes(value as WorkflowItemStatus);
}

export function compareItems(left: WorkflowItem, right: WorkflowItem): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

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

export function touchProject(snapshot: WorkflowSnapshot, projectId: string, updatedAt: number): void {
  for (const project of snapshot.projects) {
    if (project.id === projectId) {
      project.updatedAt = updatedAt;
    }
  }
}

export function findItem(snapshot: WorkflowSnapshot, itemId: string): WorkflowItem {
  const item = snapshot.items.find((candidate) => candidate.id === itemId) ?? null;

  if (!item) {
    throw new ToolHandlerError('not-found', `Item ${itemId} not found.`);
  }

  return item;
}
