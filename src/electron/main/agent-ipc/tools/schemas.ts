import { workflowItemStatuses } from './snapshot';

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

export const emptyObjectSchema = objectSchema({});
export const stringSchema = { type: 'string' } as const;
export const optionalStringSchema = { type: 'string' } as const;
export const workflowItemStatusSchema = {
  description: 'Destination lane for the work item.',
  enum: [...workflowItemStatuses],
  type: 'string',
} as const;
