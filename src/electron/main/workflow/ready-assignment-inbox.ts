// Ready-assignment inbox synchronization.

import fs from 'node:fs';
import path from 'node:path';

import type { Agent } from '@/renderer/features/agents/types';
import { READY_ASSIGNMENTS_INBOX_FILENAME } from '@/shared/agents/ready-assignments';
import { isPlainObject } from '@/shared/is-record';
import { resolveMountedItemArtifactPath } from '@/shared/workflow/project-artifacts';
import {
  resolveAgentDuneDir,
  resolveProjectDuneDir,
} from '@/electron/main/dune-paths';

/** Workflow project snapshot. */
interface WorkflowProjectSnapshot {
  id: string;
  name: string;
  rootPath: string | null;
}

/** Workflow task snapshot. */
interface WorkflowTaskSnapshot {
  id: string;
  notes: string;
  status: string;
  title: string;
}

/** Workflow item snapshot. */
interface WorkflowItemSnapshot {
  artifactFolderName: string;
  brief: string;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  sortOrder: number;
  status: string;
  tasks: WorkflowTaskSnapshot[];
  title: string;
  updatedAt: number;
}

/** Ready assignments workflow snapshot. */
export interface ReadyAssignmentsWorkflowSnapshot {
  items: WorkflowItemSnapshot[];
  projects: WorkflowProjectSnapshot[];
}

/** Ready assignment inbox task shape. */
interface ReadyAssignmentInboxTask {
  id: string;
  notes: string;
  status: string;
  title: string;
}

/** Ready assignment inbox item shape. */
interface ReadyAssignmentInboxItem {
  artifactPath: string | null;
  brief: string;
  itemId: string;
  projectId: string;
  projectName: string | null;
  sortOrder: number;
  status: 'ready' | 'active';
  tasks: ReadyAssignmentInboxTask[];
  title: string;
  updatedAt: number;
}

/** Ready assignment inbox file shape. */
interface ReadyAssignmentInboxFile {
  agent: {
    id: string;
    name: string;
  };
  generatedAt: number;
  generation: number;
  itemCount: number;
  items: ReadyAssignmentInboxItem[];
  schemaVersion: 1;
}

/** Ready assignment inbox state. */
export interface ReadyAssignmentInboxState {
  generation: number;
  itemCount: number;
  orderedItemIds: string[];
  signature: string;
}

/** Ready assignment inbox update shape. */
export interface ReadyAssignmentInboxUpdate {
  agentId: string;
  generation: number;
  itemCount: number;
  shouldWake: boolean;
}

/** Normalizes ready assignments workflow snapshot. */
export function normalizeReadyAssignmentsWorkflowSnapshot(
  value: unknown,
): ReadyAssignmentsWorkflowSnapshot | null {
  if (!isPlainObject(value) || !Array.isArray(value.items) || !Array.isArray(value.projects)) {
    return null;
  }

  const projects = value.projects.flatMap((project) => {
    if (
      !isPlainObject(project)
      || typeof project.id !== 'string'
      || typeof project.name !== 'string'
      || (
        project.rootPath !== null
        && project.rootPath !== undefined
        && typeof project.rootPath !== 'string'
      )
    ) {
      return [];
    }

    return [{
      id: project.id,
      name: project.name,
      rootPath: typeof project.rootPath === 'string' && project.rootPath.trim()
        ? project.rootPath.trim()
        : null,
    }];
  });

  const projectIds = new Set(projects.map((project) => project.id));
  const items = value.items.flatMap((item) => {
    if (
      !isPlainObject(item)
      || typeof item.id !== 'string'
      || typeof item.projectId !== 'string'
      || !projectIds.has(item.projectId)
      || typeof item.title !== 'string'
      || typeof item.brief !== 'string'
      || typeof item.status !== 'string'
      || typeof item.sortOrder !== 'number'
      || typeof item.updatedAt !== 'number'
      || !Array.isArray(item.tasks)
    ) {
      return [];
    }

    const tasks = item.tasks.flatMap((task) => {
      if (
        !isPlainObject(task)
        || typeof task.id !== 'string'
        || typeof task.title !== 'string'
        || typeof task.notes !== 'string'
        || typeof task.status !== 'string'
      ) {
        return [];
      }

      return [{
        id: task.id,
        notes: task.notes,
        status: task.status,
        title: task.title,
      }];
    });

    if (tasks.length !== item.tasks.length) {
      return [];
    }

    return [{
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : '',
      brief: item.brief,
      id: item.id,
      primaryAgentId:
        typeof item.primaryAgentId === 'string' || item.primaryAgentId === null
          ? item.primaryAgentId
          : null,
      projectId: item.projectId,
      sortOrder: item.sortOrder,
      status: item.status,
      tasks,
      title: item.title,
      updatedAt: item.updatedAt,
    }];
  });

  if (items.length !== value.items.length) {
    return null;
  }

  return { items, projects };
}

/** Synchronizes ready assignment inbox snapshots. */
export function syncReadyAssignmentInboxSnapshots(options: {
  agents: Agent[];
  homeDir: string;
  now?: () => number;
  snapshot: ReadyAssignmentsWorkflowSnapshot;
  states?: Map<string, ReadyAssignmentInboxState>;
}): {
  states: Map<string, ReadyAssignmentInboxState>;
  updates: ReadyAssignmentInboxUpdate[];
} {
  const now = options.now ?? Date.now;
  const previousStates = options.states ?? new Map<string, ReadyAssignmentInboxState>();
  const projectsById = new Map(
    options.snapshot.projects.map((project) => [project.id, project] as const),
  );
  const nextStates = new Map<string, ReadyAssignmentInboxState>();
  const updates: ReadyAssignmentInboxUpdate[] = [];

  for (const agent of options.agents) {
    const projectId = agent.projectId?.trim() ?? '';

    if (!projectId) {
      continue;
    }

    const project = projectsById.get(projectId) ?? null;
    const filePath = resolveReadyAssignmentsInboxFilePath({
      agent,
      homeDir: options.homeDir,
      projectName: project?.name ?? null,
    });
    const items = options.snapshot.items
      .filter((item) => (item.status === 'ready' || item.status === 'active') && item.primaryAgentId === agent.id)
      .sort(compareReadyItems)
      .map((item) => ({
        artifactPath: resolveMountedItemArtifactPath(
          projectsById.get(item.projectId)?.rootPath ?? null,
          item.artifactFolderName,
        ),
        brief: item.brief,
        itemId: item.id,
        projectId: item.projectId,
        projectName: projectsById.get(item.projectId)?.name ?? null,
        sortOrder: item.sortOrder,
        status: item.status as 'ready' | 'active',
        tasks: item.tasks.map((task) => ({
          id: task.id,
          notes: task.notes,
          status: task.status,
          title: task.title,
        })),
        title: item.title,
        updatedAt: item.updatedAt,
      })) satisfies ReadyAssignmentInboxItem[];

    const orderedItemIds = items.map((item) => item.itemId);
    const signature = JSON.stringify(items);
    const previousState = previousStates.get(agent.id) ?? null;
    const generation = previousState
      ? (previousState.signature === signature ? previousState.generation : previousState.generation + 1)
      : 1;
    const itemCount = items.length;
    const state = {
      generation,
      itemCount,
      orderedItemIds,
      signature,
    } satisfies ReadyAssignmentInboxState;
    const shouldWake = itemCount > 0 && (
      !previousState
      || (previousState.signature !== signature
        && !isRemovalOnlyQueueChange(previousState.orderedItemIds, orderedItemIds))
    );

    nextStates.set(agent.id, state);
    updates.push({
      agentId: agent.id,
      generation,
      itemCount,
      shouldWake,
    });

    const payload = {
      agent: {
        id: agent.id,
        name: agent.name,
      },
      generatedAt: now(),
      generation,
      itemCount,
      items,
      schemaVersion: 1,
    } satisfies ReadyAssignmentInboxFile;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  return {
    states: nextStates,
    updates,
  };
}

/** Writes ready assignment inbox snapshots. */
export function writeReadyAssignmentInboxSnapshots(options: {
  agents: Agent[];
  homeDir: string;
  now?: () => number;
  snapshot: ReadyAssignmentsWorkflowSnapshot;
}) {
  syncReadyAssignmentInboxSnapshots(options);
}

/** Resolves ready assignments inbox file path. */
function resolveReadyAssignmentsInboxFilePath(options: {
  agent: Agent;
  homeDir: string;
  projectName: string | null;
}) {
  const rootDir = options.agent.role === 'project-main'
    ? resolveProjectDuneDir(options.homeDir, options.agent.projectId!, options.projectName)
    : resolveAgentDuneDir(
      options.homeDir,
      options.agent.projectId!,
      options.projectName,
      options.agent.name,
      options.agent.id,
    );

  return path.join(rootDir, 'inbox', READY_ASSIGNMENTS_INBOX_FILENAME);
}

/** Compares ready items. */
function compareReadyItems(left: WorkflowItemSnapshot, right: WorkflowItemSnapshot) {
  if (left.projectId !== right.projectId) {
    return left.projectId.localeCompare(right.projectId);
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

/** Returns whether the previous IDs is a removal only queue change. */
function isRemovalOnlyQueueChange(previousIds: string[], nextIds: string[]) {
  if (nextIds.length > previousIds.length) {
    return false;
  }

  let previousIndex = 0;

  for (const nextId of nextIds) {
    while (previousIndex < previousIds.length && previousIds[previousIndex] !== nextId) {
      previousIndex += 1;
    }

    if (previousIndex >= previousIds.length) {
      return false;
    }

    previousIndex += 1;
  }

  return true;
}
