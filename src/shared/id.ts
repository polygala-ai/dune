// Shared ID helpers.

import { nanoid } from 'nanoid';

/** Creates ID. */
export function createId(prefix: string): string {
  return `${prefix}-${nanoid()}`;
}

/** Creates project ID. */
export function createProjectId(): string {
  return nanoid(8);
}
