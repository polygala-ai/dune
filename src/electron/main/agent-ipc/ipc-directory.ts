import path from 'node:path';

import { toAgentPathId } from '@/shared/agents/agent-id';

export const AGENT_IPC_METADATA_FILENAME = 'dune-ipc.json';

export interface AgentIpcDirectoryMetadata {
  version: 2;
  agentId: string;
  projectId: string;
  agentName: string;
  projectName: string | null;
}

interface LegacyAgentIpcDirectoryMetadata {
  version: 1;
  projectId: string;
  agentName: string;
}

function sanitizePathSegment(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function resolveProjectPathSegment(
  projectId: string,
  projectName: string | null | undefined,
): string {
  const projectIdSegment = sanitizePathSegment(projectId, 'project');
  const trimmedProjectName = projectName?.trim() ?? '';

  if (!trimmedProjectName) {
    return projectIdSegment;
  }

  return `${sanitizePathSegment(trimmedProjectName, 'project')}-${projectIdSegment}`;
}

export function createAgentIpcDirectoryMetadata(
  projectId: string,
  agentId: string,
  agentName: string,
  projectName: string | null = null,
): AgentIpcDirectoryMetadata {
  return {
    version: 2,
    agentId,
    projectId,
    agentName,
    projectName: projectName?.trim() || null,
  };
}

export function parseAgentIpcDirectoryMetadata(rawValue: string): AgentIpcDirectoryMetadata | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<AgentIpcDirectoryMetadata>
    & Partial<LegacyAgentIpcDirectoryMetadata>;

  if (
    candidate.version === 1
    && typeof candidate.projectId === 'string'
    && candidate.projectId.trim()
    && typeof candidate.agentName === 'string'
    && candidate.agentName.trim()
  ) {
    return {
      version: 2,
      agentId: '',
      projectId: candidate.projectId,
      agentName: candidate.agentName,
      projectName: null,
    };
  }

  if (
    candidate.version !== 2
    || typeof candidate.projectId !== 'string'
    || !candidate.projectId.trim()
    || typeof candidate.agentId !== 'string'
    || typeof candidate.agentName !== 'string'
    || !candidate.agentName.trim()
    || (
      candidate.projectName !== null
      && candidate.projectName !== undefined
      && typeof candidate.projectName !== 'string'
    )
  ) {
    return null;
  }

  return {
    version: 2,
    agentId: candidate.agentId,
    projectId: candidate.projectId,
    agentName: candidate.agentName,
    projectName: candidate.projectName?.trim() || null,
  };
}

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
    `${sanitizePathSegment(agentName, 'agent')}-${sanitizePathSegment(toAgentPathId(agentId), 'agent')}`,
  );
}

export function resolveAgentIpcDir(
  homeDir: string,
  projectId: string,
  projectName: string | null | undefined,
  agentName: string,
  agentId: string,
): string {
  return path.join(resolveAgentDuneDir(homeDir, projectId, projectName, agentName, agentId), 'ipc');
}

export function resolveAgentIpcMetadataPath(ipcDir: string): string {
  return path.join(ipcDir, AGENT_IPC_METADATA_FILENAME);
}
