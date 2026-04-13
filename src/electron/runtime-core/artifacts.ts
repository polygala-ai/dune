import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { READY_ASSIGNMENTS_INBOX_MOUNT_PATH } from '@/shared/agents/ready-assignments';

const ARTIFACTS_DIR_NAME = 'artifacts';

/**
 * Source .md files live in src/shared/agent-ipc/.
 * At build time they are bundled alongside the app.
 * At runtime, seedArtifacts() copies them to ~/.dune/artifacts/ if missing,
 * and readAgentInstructions() / readIpcGuide() read from there.
 */
const SOURCE_DIR = path.resolve(process.cwd(), 'src', 'shared', 'agent-ipc');

export const ARTIFACT_FILES = {
  agentInstructions: 'dune-agent-instructions.md',
  ipcGuide: 'ipc-guide.md',
  projectMainInstructions: 'project-main-instructions.md',
} as const;

export function resolveArtifactsDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.dune', ARTIFACTS_DIR_NAME);
}

function readSourceFile(filename: string): string {
  return fs.readFileSync(path.join(SOURCE_DIR, filename), 'utf-8');
}

/** Seed artifact files, always overwriting with the latest bundled version. */
export function seedArtifacts(homeDir: string = os.homedir()): void {
  const dir = resolveArtifactsDir(homeDir);
  fs.mkdirSync(dir, { recursive: true });

  for (const filename of Object.values(ARTIFACT_FILES)) {
    const targetPath = path.join(dir, filename);
    const sourcePath = path.join(SOURCE_DIR, filename);

    try {
      fs.copyFileSync(sourcePath, targetPath);
    } catch {
      // Source file may not exist in packaged builds; only write placeholder if missing.
      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, `# ${filename}\n\nEdit this file to customize agent behavior.\n`, 'utf-8');
      }
    }
  }
}

/** Read agent instructions from the artifacts directory, falling back to source. */
export function readAgentInstructions(
  role: 'project-main' | 'custom' = 'custom',
  homeDir: string = os.homedir(),
): string {
  const filename = role === 'project-main'
    ? ARTIFACT_FILES.projectMainInstructions
    : ARTIFACT_FILES.agentInstructions;
  const artifactPath = path.join(resolveArtifactsDir(homeDir), filename);

  try {
    return fs.readFileSync(artifactPath, 'utf-8').trim();
  } catch {
    try {
      return readSourceFile(filename).trim();
    } catch {
      return '';
    }
  }
}

export interface IpcGuideOptions {
  ipcMountPath?: string;
  rootMountPath?: string;
}

/** Read IPC guide template from artifacts and interpolate variables. */
export function readIpcGuide(
  projectId: string,
  options: IpcGuideOptions = {},
  homeDir: string = os.homedir(),
): string {
  const filePath = path.join(resolveArtifactsDir(homeDir), ARTIFACT_FILES.ipcGuide);
  const rootMountPath = options.rootMountPath ?? '/workspace/extra/dune/';
  const ipcMountPath = options.ipcMountPath ?? `${rootMountPath}ipc/`;

  let template: string;

  try {
    template = fs.readFileSync(filePath, 'utf-8');
  } catch {
    try {
      template = readSourceFile(ARTIFACT_FILES.ipcGuide);
    } catch {
      template = '';
    }
  }

  return template
    .replaceAll('{{projectId}}', projectId)
    .replaceAll('{{rootMountPath}}', rootMountPath)
    .replaceAll('{{ipcMountPath}}', ipcMountPath)
    .replaceAll('{{readyAssignmentsInboxPath}}', READY_ASSIGNMENTS_INBOX_MOUNT_PATH);
}
