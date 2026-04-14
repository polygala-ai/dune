// Agent runtime filesystem layout helpers.

import fs from 'node:fs';
import path from 'node:path';

import { createAgentIpcDirectoryMetadata, resolveAgentIpcMetadataPath } from '@/electron/main/agent-ipc/ipc-directory';
import {
  findAgentDuneDirs,
  findProjectDuneDirs,
  resolveAgentDuneDir,
  resolveAgentIpcDir,
  resolveProjectDuneDir,
} from '@/electron/main/dune-paths';
import type { AgentRole } from '@/renderer/features/agents/types';

import { copyDirRecursive, readIpcGuide } from '../artifacts';

export { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';

const AGENT_IPC_SOURCE_NAMES = [
  'skills/dune',
  'skills/dune-project-kickoff',
  'mcp',
] as const;

/**
 * Extract agent-ipc source directories from the bundled location (which may
 * live inside app.asar) to a writable, asar-free location under ~/.dune/.
 * AgentLite's addSkill/addMcpServer validate the path exists on disk and
 * downstream code copies the tree with fs.cpSync — neither is asar-safe, so
 * we stage a plain-filesystem copy once per boot.
 */
export function seedAgentIpcSources(bundledDir: string, homeDir: string): string {
  const stagingDir = path.join(homeDir, '.dune', 'agent-ipc');
  fs.mkdirSync(stagingDir, { recursive: true });
  for (const name of AGENT_IPC_SOURCE_NAMES) {
    const src = path.join(bundledDir, name);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(stagingDir, name);
    if (fs.existsSync(dst)) {
      fs.rmSync(dst, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    copyDirRecursive(src, dst);
  }
  return stagingDir;
}

/** Creates IPC layout. */
export function createIpcLayout(
  homeDir: string,
  projectId: string,
  projectName: string | null,
  agentId: string,
  agentName: string,
  agentRole: AgentRole,
): { duneMountRoot: string; ipcDir: string } {
  const projectDir = resolveProjectDuneDir(homeDir, projectId, projectName);
  const agentDir = resolveAgentDuneDir(homeDir, projectId, projectName, agentName, agentId);
  const ipcDir = resolveAgentIpcDir(homeDir, projectId, projectName, agentName, agentId);

  fs.mkdirSync(path.join(ipcDir, 'agent'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'host'), { recursive: true });

  fs.writeFileSync(
    resolveAgentIpcMetadataPath(ipcDir),
    `${JSON.stringify(
      createAgentIpcDirectoryMetadata(projectId, agentId, agentName, projectName),
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(projectDir, 'CLAUDE.md'),
    readIpcGuide(projectId, {
      ipcMountPath: `/workspace/extra/dune/agents/${path.basename(agentDir)}/ipc/`,
      rootMountPath: '/workspace/extra/dune/',
    }, homeDir),
  );
  fs.writeFileSync(path.join(agentDir, 'CLAUDE.md'), readIpcGuide(projectId, {}, homeDir));

  if (projectName) {
    for (const agentPath of findAgentDuneDirs(homeDir, projectId, agentId)) {
      if (agentPath !== agentDir) {
        fs.rmSync(agentPath, { force: true, recursive: true });
      }
    }

    for (const projectPath of findProjectDuneDirs(homeDir, projectId)) {
      if (projectPath !== projectDir) {
        fs.rmSync(projectPath, { force: true, recursive: true });
      }
    }
  }

  return {
    duneMountRoot: agentRole === 'project-main' ? projectDir : agentDir,
    ipcDir,
  };
}
