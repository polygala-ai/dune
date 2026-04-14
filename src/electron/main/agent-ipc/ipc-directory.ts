// IPC directory discovery helpers.

import path from 'node:path';

import { isPlainObject } from '@/shared/is-record';

/** Agent IPC metadata filename constant. */
export const AGENT_IPC_METADATA_FILENAME = 'dune-ipc.json';

/** Agent IPC directory metadata shape. */
export interface AgentIpcDirectoryMetadata {
  version: 2;
  agentId: string;
  projectId: string;
  agentName: string;
  projectName: string | null;
}

/** Creates agent IPC directory metadata. */
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

/** Parses agent IPC directory metadata. */
export function parseAgentIpcDirectoryMetadata(rawValue: string): AgentIpcDirectoryMetadata | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) {
    return null;
  }

  const candidate = parsed as Partial<AgentIpcDirectoryMetadata>;

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

/** Resolves agent IPC metadata path. */
export function resolveAgentIpcMetadataPath(ipcDir: string): string {
  return path.join(ipcDir, AGENT_IPC_METADATA_FILENAME);
}
