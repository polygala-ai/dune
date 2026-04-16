//  presenter helpers IPC tool handlers.

import {
  normalizeProjectRootPath,
  resolveMountedItemArtifactPath,
} from '@/shared/workflow/project-artifacts';

import type { RuntimeAgent, RuntimeSnapshot } from './types';
import type { WorkflowItem, WorkflowProject, WorkflowSnapshot } from './snapshot';

/** Presents project. */
export function presentProject(project: WorkflowProject) {
  return {
    ...project,
    rootPath: normalizeProjectRootPath(project.rootPath),
  };
}

/** Presents item. */
export function presentItem(snapshot: WorkflowSnapshot, item: WorkflowItem) {
  const project = snapshot.projects.find((candidate) => candidate.id === item.projectId) ?? null;

  return {
    ...item,
    artifactPath: resolveMountedItemArtifactPath(project?.rootPath ?? null, item.artifactFolderName),
  };
}

/** Sanitizes agent. */
export function sanitizeAgent(agent: RuntimeAgent) {
  return {
    id: agent.id,
    name: agent.name,
    projectId: agent.projectId,
    role: agent.role,
    status: agent.status,
    updatedAt: agent.updatedAt,
  };
}

/** Sanitizes runtime snapshot. */
export function sanitizeRuntimeSnapshot(snapshot: RuntimeSnapshot, projectId: string) {
  return {
    agents: snapshot.agents
      .filter((agent) => agent.projectId === projectId)
      .map(sanitizeAgent),
    isStreaming: snapshot.isStreaming,
    runtimeInfo: snapshot.runtimeInfo,
  };
}
