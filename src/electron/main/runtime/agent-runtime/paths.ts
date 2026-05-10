// Agent runtime filesystem layout helpers.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);

const AGENT_SUPPORT_SOURCE_NAMES = [
  'skills/dune',
  'skills/dune-project-kickoff',
] as const;

const RUNNER_SOURCE_FINGERPRINT_FILE = '.dune-runner-src-fingerprint';

function findNearestPackageRoot(startPath: string): string | null {
  let currentDir = path.dirname(startPath);

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}

function resolveAgentLiteRunnerSourceDir(): string | null {
  try {
    const packageRoot = findNearestPackageRoot(require.resolve('@boxlite-ai/agentlite'));

    if (!packageRoot) {
      return null;
    }

    const runnerSourceDir = path.join(
      packageRoot,
      'container',
      'agent-runner',
      'src',
    );

    return fs.existsSync(runnerSourceDir) ? runnerSourceDir : null;
  } catch {
    return null;
  }
}

function hashDirectory(dir: string): string {
  const hash = crypto.createHash('sha256');

  function visit(currentDir: string, relativeDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name === RUNNER_SOURCE_FINGERPRINT_FILE) {
        continue;
      }

      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(currentDir, entry.name);
      hash.update(entry.isDirectory() ? 'dir:' : 'file:');
      hash.update(relativePath);
      hash.update('\0');

      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else {
        hash.update(fs.readFileSync(absolutePath));
        hash.update('\0');
      }
    }
  }

  visit(dir, '');

  return hash.digest('hex');
}

/**
 * Refresh the AgentLite runner source copied into a Dune-managed agent session.
 *
 * AgentLite copies this source tree only when the session directory is missing.
 * Existing agents can therefore keep an old Claude-only runner after the app is
 * upgraded or after the backend switches to Codex. Dune owns these session
 * runner copies, so keep them aligned with the installed AgentLite package.
 */
export function seedAgentRunnerSource(runtimeRoot: string, agentGroupFolder: string) {
  const sourceDir = resolveAgentLiteRunnerSourceDir();

  if (!sourceDir) {
    return;
  }

  const targetDir = path.join(
    runtimeRoot,
    'agents',
    agentGroupFolder,
    'data',
    'sessions',
    'main',
    'agent-runner-src',
  );
  const sourceFingerprint = hashDirectory(sourceDir);
  const markerPath = path.join(targetDir, RUNNER_SOURCE_FINGERPRINT_FILE);

  if (fs.existsSync(targetDir)) {
    if (fs.existsSync(markerPath)) {
      const targetFingerprint = fs.readFileSync(markerPath, 'utf-8').trim();

      if (targetFingerprint === sourceFingerprint) {
        return;
      }
    } else if (hashDirectory(targetDir) === sourceFingerprint) {
      fs.writeFileSync(markerPath, `${sourceFingerprint}\n`);
      return;
    }
  }

  fs.rmSync(targetDir, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  copyDirRecursive(sourceDir, targetDir);
  fs.writeFileSync(markerPath, `${sourceFingerprint}\n`);
}

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

/** Seeds host Codex login into AgentLite's isolated Codex home when available. */
export function seedCodexAuth(homeDir: string, runtimeRoot: string, agentGroupFolder: string) {
  const sourceAuthPath = path.join(homeDir, '.codex', 'auth.json');

  if (!fs.existsSync(sourceAuthPath)) {
    return;
  }

  const codexHomeDir = path.join(
    runtimeRoot,
    'agents',
    agentGroupFolder,
    'data',
    'sessions',
    'main',
    '.codex',
  );
  const targetAuthPath = path.join(codexHomeDir, 'auth.json');

  fs.mkdirSync(codexHomeDir, { recursive: true });
  fs.copyFileSync(sourceAuthPath, targetAuthPath);
  try {
    fs.chmodSync(targetAuthPath, 0o600);
  } catch {
    // Best-effort on platforms that do not support chmod semantics.
  }
}
