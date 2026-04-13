export interface ProjectArtifactEntry {
  kind: 'directory' | 'file';
  modifiedAt: number;
  name: string;
  path: string;
  relativePath: string;
  size: number | null;
}

export const PROJECT_ARTIFACT_MOUNT_ROOT = '/workspace/extra/project/';

export function sanitizeArtifactFolderSegment(value: string, fallback: string = 'item'): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

export function createArtifactFolderName(title: string, itemId: string): string {
  const titleSegment = sanitizeArtifactFolderSegment(title, 'item');
  const itemIdSuffix = itemId.trim().split('-').pop()?.slice(0, 8) ?? 'item';

  return `${titleSegment}-${itemIdSuffix}`;
}

export function normalizeProjectRootPath(rootPath: string | null | undefined): string | null {
  const trimmedRootPath = rootPath?.trim() ?? '';

  return trimmedRootPath ? trimmedRootPath : null;
}

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
