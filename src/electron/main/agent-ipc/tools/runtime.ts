import { sanitizeRuntimeSnapshot } from './presenters';
import { emptyObjectSchema } from './schemas';
import type { RegisteredTool } from './types';

export const runtimeTools: RegisteredTool[] = [
  {
    definition: {
      description: 'Inspect the sanitized Dune runtime snapshot.',
      inputSchema: emptyObjectSchema,
      name: 'runtime.get_snapshot',
    },
    handler: async ({ agentContext, getRuntimeController }) => {
      return { snapshot: sanitizeRuntimeSnapshot(getRuntimeController().getSnapshot(), agentContext.projectId) };
    },
  },
];
