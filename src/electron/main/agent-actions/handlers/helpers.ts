// Agent IPC tool helper functions.

import { ToolHandlerError } from './types';
import type { WorkflowSnapshot } from './snapshot';

/** Returns string or throws. */
export function requireString(value: unknown, field: string): string {
  const normalized = optionalString(value);

  if (!normalized) {
    throw new ToolHandlerError('validation-error', `${field} is required.`);
  }

  return normalized;
}

/** Optionals string. */
export function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

/** Reads record. */
export function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ToolHandlerError('validation-error', `${field} must be an object.`);
}

/** Resolves project ID. */
export function resolveProjectId(projectIdValue: unknown, fallbackProjectId: string): string {
  const projectId = optionalString(projectIdValue) ?? fallbackProjectId;

  if (!projectId) {
    throw new ToolHandlerError('validation-error', 'Project id is required.');
  }

  return projectId;
}

/** Asserts project exists. */
export function assertProjectExists(snapshot: WorkflowSnapshot, projectId: string): void {
  if (!snapshot.projects.some((project) => project.id === projectId)) {
    throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
  }
}
