import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeProjectRootPath,
  type ProjectArtifactEntry,
} from '@/shared/workflow/project-artifacts';

function readDirectoryEntries(rootPath: string) {
  try {
    return fs.readdirSync(rootPath);
  } catch (error) {
    throw new Error(
      `Unable to inspect "${rootPath}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const ignoredProjectRootEntries = new Set([
  '.DS_Store',
  '.localized',
  'CLAUDE.md',
  'desktop.ini',
  'Thumbs.db',
]);

function listProjectRootContentEntries(rootPath: string) {
  return readDirectoryEntries(rootPath).filter((entry) => !ignoredProjectRootEntries.has(entry));
}

function createProjectRootClaudeMdContent() {
  return `# Project Artifact Guide

This directory is mounted inside the agent runtime at \`/workspace/extra/project/\`.

- Treat this folder as the user-owned project root.
- Each work item keeps its generated files in its own artifact subfolder under this root.
- When a work item payload includes \`artifactPath\`, read existing files from that folder and write generated files there.
- Prefer keeping work-item-specific files inside the matching artifact folder instead of the project root.
- Do not rename, move, or delete other item folders unless the user explicitly asks for it.
`;
}

export function resolveProjectRootPath(rootPath: string): string {
  return path.resolve(rootPath.trim());
}

export function assertEmptyProjectRootDirectory(rootPath: string): string {
  const resolvedRootPath = resolveProjectRootPath(rootPath);
  let stats: fs.Stats;

  try {
    stats = fs.statSync(resolvedRootPath);
  } catch (error) {
    throw new Error(
      `Project folder "${resolvedRootPath}" is unavailable. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error('Project folder must be an existing directory.');
  }

  if (listProjectRootContentEntries(resolvedRootPath).length > 0) {
    throw new Error('Project folder must be empty.');
  }

  return resolvedRootPath;
}

export function ensureProjectRootClaudeMd(rootPath: string): string {
  const resolvedRootPath = resolveProjectRootPath(rootPath);
  const claudeMdPath = path.join(resolvedRootPath, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, createProjectRootClaudeMdContent());
  }

  return claudeMdPath;
}

export function prepareProjectRootPath(
  rootPath: string,
  artifactFolderNames: string[],
): string {
  const resolvedRootPath = assertEmptyProjectRootDirectory(rootPath);
  ensureProjectRootClaudeMd(resolvedRootPath);

  for (const artifactFolderName of artifactFolderNames) {
    ensureProjectArtifactFolder(resolvedRootPath, artifactFolderName);
  }

  return resolvedRootPath;
}

export function ensureProjectArtifactFolder(
  rootPath: string,
  artifactFolderName: string,
): string {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);
  const normalizedArtifactFolderName = artifactFolderName.trim();

  if (!normalizedRootPath || !normalizedArtifactFolderName) {
    throw new Error('Project folder path and artifact folder name are required.');
  }

  ensureProjectRootClaudeMd(normalizedRootPath);
  const artifactPath = path.join(resolveProjectRootPath(normalizedRootPath), normalizedArtifactFolderName);
  fs.mkdirSync(artifactPath, { recursive: true });
  return artifactPath;
}

function resolveProjectArtifactFolderPath(rootPath: string, artifactFolderName: string): string {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);
  const normalizedArtifactFolderName = artifactFolderName.trim();

  if (!normalizedRootPath || !normalizedArtifactFolderName) {
    throw new Error('Project folder path and artifact folder name are required.');
  }

  return path.join(resolveProjectRootPath(normalizedRootPath), normalizedArtifactFolderName);
}

function collectArtifactEntries(
  artifactRootPath: string,
  currentPath: string,
  entries: ProjectArtifactEntry[],
) {
  const directoryEntries = fs.readdirSync(currentPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(currentPath, directoryEntry.name);
    const stats = fs.statSync(entryPath);
    const isDirectory = stats.isDirectory();

    entries.push({
      kind: isDirectory ? 'directory' : 'file',
      modifiedAt: stats.mtimeMs,
      name: directoryEntry.name,
      path: entryPath,
      relativePath: path.relative(artifactRootPath, entryPath),
      size: isDirectory ? null : stats.size,
    });

    if (isDirectory) {
      collectArtifactEntries(artifactRootPath, entryPath, entries);
    }
  }
}

export function listProjectArtifactEntries(
  rootPath: string,
  artifactFolderName: string,
): ProjectArtifactEntry[] {
  const artifactPath = resolveProjectArtifactFolderPath(rootPath, artifactFolderName);

  if (!fs.existsSync(artifactPath)) {
    return [];
  }

  let stats: fs.Stats;

  try {
    stats = fs.statSync(artifactPath);
  } catch (error) {
    throw new Error(
      `Unable to inspect "${artifactPath}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`Artifact folder "${artifactPath}" is not a directory.`);
  }

  const entries: ProjectArtifactEntry[] = [];
  collectArtifactEntries(artifactPath, artifactPath, entries);

  return entries.sort((left, right) =>
    right.modifiedAt - left.modifiedAt || left.relativePath.localeCompare(right.relativePath));
}

export function ensureProjectArtifactFolders(
  rootPath: string,
  artifactFolderNames: string[],
): string[] {
  return artifactFolderNames.map((artifactFolderName) =>
    ensureProjectArtifactFolder(rootPath, artifactFolderName),
  );
}
