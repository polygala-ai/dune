// Agent runtime filesystem layout helpers.

import fs from 'node:fs';
import path from 'node:path';

import {
  findAgentDuneDirs,
  findProjectDuneDirs,
  resolveAgentDuneDir,
  resolveProjectDuneDir,
} from '@/electron/main/dune-paths';
import type { AgentArchetype } from '@/renderer/features/agents/types';

import { copyDirRecursive, readProjectGuide } from '../artifacts';

export { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';

const AGENT_SUPPORT_SOURCE_NAMES = [
  'skills/dune',
  'skills/dune-project-kickoff',
] as const;

/**
 * Extract bundled agent support directories from the bundled location (which may
 * live inside app.asar) to a writable, asar-free location under ~/.dune/.
 * AgentLite's addSkill/addMcpServer validate the path exists on disk and
 * downstream code copies the tree with fs.cpSync — neither is asar-safe, so
 * we stage a plain-filesystem copy once per boot.
 */
export function seedAgentSupportSources(bundledDir: string, homeDir: string): string {
  const stagingDir = path.join(homeDir, '.dune', 'agent-support');
  fs.mkdirSync(stagingDir, { recursive: true });
  for (const name of AGENT_SUPPORT_SOURCE_NAMES) {
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

/**
 * Creates the per-agent dune mount layout. The `dune` mount carries skills,
 * generated guides, and other agent support files into the BoxLite VM.
 */
export function createDuneMountLayout(
  homeDir: string,
  projectId: string,
  projectName: string | null,
  projectRootPath: string | null,
  agentId: string,
  agentName: string,
  agentArchetype: AgentArchetype,
): { duneMountRoot: string } {
  const projectDir = resolveProjectDuneDir(homeDir, projectId, projectName);
  const agentDir = resolveAgentDuneDir(homeDir, projectId, projectName, agentName, agentId);
  const resolvedProjectRootPath = projectRootPath ? path.resolve(projectRootPath) : null;

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });

  fs.writeFileSync(
    path.join(projectDir, 'CLAUDE.md'),
    readProjectGuide(projectId, {
      ipcMountPath: `/workspace/extra/dune/agents/${path.basename(agentDir)}/`,
      rootMountPath: '/workspace/extra/dune/',
      ...(resolvedProjectRootPath ? { projectHostPath: resolvedProjectRootPath } : {}),
    }, homeDir),
  );
  fs.writeFileSync(
    path.join(agentDir, 'CLAUDE.md'),
    readProjectGuide(
      projectId,
      resolvedProjectRootPath ? { projectHostPath: resolvedProjectRootPath } : {},
      homeDir,
    ),
  );

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
    duneMountRoot: agentArchetype === 'project-main' ? projectDir : agentDir,
  };
}
