// Runtime IPC tool handlers.

import { sanitizeRuntimeSnapshot } from './presenters';
import { emptyObjectSchema } from './schemas';
import type { RegisteredTool } from './types';

/** Lists runtime tools. */
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
  {
    definition: {
      description: 'Run a batch of per-target isolated research passes, then merge them with a reducer prompt.',
      inputSchema: {
        maxConcurrency: {
          type: 'number',
        },
        reducerPrompt: {
          type: 'string',
        },
        sharedPrompt: {
          type: 'string',
        },
        targets: {
          items: {
            properties: {
              brief: { type: 'string' },
              id: { type: 'string' },
              title: { type: 'string' },
            },
            required: ['title', 'brief'],
            type: 'object',
          },
          type: 'array',
        },
      },
      name: 'runtime.run_isolated_research',
    },
    handler: async ({ agentContext, getRuntimeController }, args) => {
      return getRuntimeController().runIsolatedResearch(agentContext.agentId, {
        ...(typeof args.maxConcurrency === 'number' ? { maxConcurrency: args.maxConcurrency } : {}),
        reducerPrompt: String(args.reducerPrompt ?? ''),
        sharedPrompt: String(args.sharedPrompt ?? ''),
        targets: Array.isArray(args.targets)
          ? args.targets.flatMap((entry) => {
              if (!entry || typeof entry !== 'object') {
                return [];
              }

              const candidate = entry as Record<string, unknown>;
              const title = typeof candidate.title === 'string' ? candidate.title : '';
              const brief = typeof candidate.brief === 'string' ? candidate.brief : '';
              const id = typeof candidate.id === 'string' ? candidate.id : null;

              return [{ brief, id, title }];
            })
          : [],
      });
    },
  },
  {
    definition: {
      description: 'Get real-time activity status for all active agent sessions.',
      inputSchema: emptyObjectSchema,
      name: 'runtime.get_agent_activity',
    },
    handler: async ({ getRuntimeController }) => {
      return getRuntimeController().getAgentActivitySnapshot();
    },
  },
];
