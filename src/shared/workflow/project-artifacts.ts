// Shared project artifact path helpers.

import { sanitizeSlug } from '@/shared/sanitize';

/** Project artifact entry shape. */
export interface ProjectArtifactEntry {
  kind: 'directory' | 'file';
  modifiedAt: number;
  name: string;
  path: string;
  relativePath: string;
  size: number | null;
}

/** Project artifact mount root constant. */
export const PROJECT_ARTIFACT_MOUNT_ROOT = '/workspace/extra/project/';

/** Sanitizes artifact folder segment. */
export function sanitizeArtifactFolderSegment(value: string, fallback: string = 'item'): string {
  return sanitizeSlug(value, fallback);
}

/** Creates artifact folder name. */
export function createArtifactFolderName(title: string, itemId: string): string {
  const titleSegment = sanitizeArtifactFolderSegment(title, 'item');
  const itemIdSuffix = itemId.trim().split('-').pop()?.slice(0, 8) ?? 'item';

  return `${titleSegment}-${itemIdSuffix}`;
}

/** Normalizes project root path. */
export function normalizeProjectRootPath(rootPath: string | null | undefined): string | null {
  const trimmedRootPath = rootPath?.trim() ?? '';

  return trimmedRootPath ? trimmedRootPath : null;
}

/** Resolves item artifact path. */
export function resolveItemArtifactPath(
  rootPath: string | null | undefined,
  artifactFolderName: string | null | undefined,
): string | null {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);
  const normalizedArtifactFolderName = artifactFolderName?.trim() ?? '';

  if (!normalizedRootPath || !normalizedArtifactFolderName) {
    return null;
  }

  const separator = normalizedRootPath.includes('\\') ? '\\' : '/';

  return `${normalizedRootPath.replace(/[\\/]+$/g, '')}${separator}${normalizedArtifactFolderName}`;
}

/** Resolves mounted item artifact path. */
export function resolveMountedItemArtifactPath(
  rootPath: string | null | undefined,
  artifactFolderName: string | null | undefined,
): string | null {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);
  const normalizedArtifactFolderName = artifactFolderName?.trim() ?? '';

  if (!normalizedRootPath || !normalizedArtifactFolderName) {
    return null;
  }

  return `${PROJECT_ARTIFACT_MOUNT_ROOT.replace(/\/+$/g, '')}/${normalizedArtifactFolderName}`;
}
