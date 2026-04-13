import { READY_ASSIGNMENTS_INBOX_MOUNT_PATH } from '@/shared/agents/ready-assignments';

export interface DuneClaudeMdOptions {
  ipcMountPath?: string;
  rootMountPath?: string;
}

/** Generate the CLAUDE.md content for a mounted Dune project or agent root. */
export function createIpcClaudeMd(
  projectId: string,
  options: DuneClaudeMdOptions = {},
): string {
  const rootMountPath = options.rootMountPath ?? '/workspace/extra/dune/';
  const ipcMountPath = options.ipcMountPath ?? `${rootMountPath}ipc/`;

  return `# Dune Agent Guide

You are running inside Dune.

Dune is a desktop app for managing projects, work items, and agents. Each agent belongs to a Dune project and should use Dune tools to inspect and update project state.

## Your Environment

- Your project ID is \`${projectId}\`.
- Dune mounts project data at \`${rootMountPath}\`.
- If this project has a user-owned artifact folder, it is mounted at \`/workspace/extra/project/\`.
- Your ready-assignment inbox is at \`${READY_ASSIGNMENTS_INBOX_MOUNT_PATH}\`.
- Your IPC/tool channel is at \`${ipcMountPath}\`.
- Read host messages from \`${ipcMountPath}host/\`.
- Write requests to \`${ipcMountPath}agent/\`.

## How To Work

- Call \`tools/list\` first to discover available tools.
- Use \`tools/call\` to invoke a tool.
- Use \`workflow.*\` tools for projects, items, tasks, assignments, and outputs.
- Use \`agents.*\` tools for agent creation and lookup.
- Coordinate through work items, tasks, assignments, and work products.
- Use \`runtime.*\` tools only when project or agent tools are not enough.
- Read before write when updating existing Dune state.
- Never invent IDs; get them from tool results.
- After a mutation, use the returned result as the new source of truth.

## Safety Rules

- Prefer project-scoped tools.
- Do not use direct agent messages for coordination.
- Do not edit raw Dune storage directly.
- If a tool call is denied or requires approval, stop and explain briefly.
`;
}
