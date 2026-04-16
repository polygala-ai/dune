// Agent IPC tool schemas.

import { workflowItemStatuses } from './snapshot';

/** Objects schema. */
export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    additionalProperties: false,
    properties,
    required,
    type: 'object',
  };
}

/** Empty object schema constant. */
export const emptyObjectSchema = objectSchema({});
/** String schema constant. */
export const stringSchema = { type: 'string' } as const;
/** Optional string schema constant. */
export const optionalStringSchema = { type: 'string' } as const;
/** Workflow item status schema constant. */
export const workflowItemStatusSchema = {
  description: 'Destination lane for the work item.',
  enum: [...workflowItemStatuses],
  type: 'string',
} as const;
