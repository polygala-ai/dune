// Dune path discovery helpers.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { toAgentPathId } from '@/shared/agents/agent-id';
import { sanitizeSlug } from '@/shared/sanitize';

/** Resolves agent lite runtime root. */
export function resolveAgentLiteRuntimeRoot(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.dune', 'agentlite');
}

/** Resolves project path segment. */
function resolveProjectPathSegment(
  projectId: string,
  projectName: string | null | undefined,
): string {
  const projectIdSegment = sanitizeSlug(projectId, 'project');
  const trimmedProjectName = projectName?.trim() ?? '';

  if (!trimmedProjectName) {
    return projectIdSegment;
  }

  return `${sanitizeSlug(trimmedProjectName, 'project')}-${projectIdSegment}`;
}

/** Resolves project Dune dir. */
export function resolveProjectDuneDir(
  homeDir: string,
  projectId: string,
  projectName?: string | null,
): string {
  return path.join(
    homeDir,
    '.dune',
    'projs',
    resolveProjectPathSegment(projectId, projectName),
  );
}

/** Resolves agent Dune dir. */
export function resolveAgentDuneDir(
  homeDir: string,
  projectId: string,
  projectName: string | null | undefined,
  agentName: string,
  agentId: string,
): string {
  return path.join(
    resolveProjectDuneDir(homeDir, projectId, projectName),
    'agents',
    `${sanitizeSlug(agentName, 'agent')}-${sanitizeSlug(toAgentPathId(agentId), 'agent')}`,
  );
}

/** Resolves agent IPC dir. */
export function resolveAgentIpcDir(
  homeDir: string,
  projectId: string,
  projectName: string | null | undefined,
  agentName: string,
  agentId: string,
): string {
  return path.join(
    resolveAgentDuneDir(homeDir, projectId, projectName, agentName, agentId),
    'ipc',
  );
}

/** Finds project Dune dirs. */
export function findProjectDuneDirs(
  homeDir: string,
  projectId: string,
): string[] {
  const projsDir = path.join(homeDir, '.dune', 'projs');

  if (!fs.existsSync(projsDir)) {
    return [];
  }

  const projectIdSegment = sanitizeSlug(projectId, 'project');
  const matchingProjectDirs: string[] = [];

  for (const entry of fs.readdirSync(projsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === projectIdSegment || entry.name.endsWith(`-${projectIdSegment}`)) {
      matchingProjectDirs.push(path.join(projsDir, entry.name));
    }
  }

  return matchingProjectDirs;
}

/** Finds agent Dune dirs. */
export function findAgentDuneDirs(
  homeDir: string,
  projectId: string,
  agentId: string,
): string[] {
  const agentIdSegments = new Set([
    sanitizeSlug(agentId, 'agent'),
    sanitizeSlug(toAgentPathId(agentId), 'agent'),
  ]);
  const matchingAgentDirs: string[] = [];

  for (const projectDir of findProjectDuneDirs(homeDir, projectId)) {
    const agentsDir = path.join(projectDir, 'agents');

    if (!fs.existsSync(agentsDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (
        [...agentIdSegments].some((agentIdSegment) =>
          entry.name === agentIdSegment || entry.name.endsWith(`-${agentIdSegment}`),
        )
      ) {
        matchingAgentDirs.push(path.join(agentsDir, entry.name));
      }
    }
  }

  return matchingAgentDirs;
}
