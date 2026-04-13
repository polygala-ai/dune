import { nanoid } from 'nanoid';

export function createId(prefix: string): string {
  return `${prefix}-${nanoid()}`;
}

export function createProjectId(): string {
  return nanoid(8);
}
