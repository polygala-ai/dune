import { nanoid } from 'nanoid';

export function createId(prefix: string): string {
  return `${prefix}-${nanoid()}`;
}
