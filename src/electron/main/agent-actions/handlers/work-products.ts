// Work products IPC tool handlers.

import { createId } from '@/shared/id';

import { optionalString, requireString } from './helpers';
import {
  createWorkflowEvent,
  findItem,
  prependWorkflowEvents,
  readWorkflowSnapshot,
  touchProject,
  writeWorkflowSnapshot,
} from './snapshot';
import { objectSchema, optionalStringSchema, stringSchema } from './schemas';
import { assertAgentCanAddWorkProduct } from './validators';
import type { RegisteredTool } from './types';

/** Lists work product tools. */
export const workProductTools: RegisteredTool[] = [
  {
    definition: {
      description: 'Add a work product to a Dune work item.',
      inputSchema: objectSchema(
        {
          body: stringSchema,
          itemId: stringSchema,
          note: optionalStringSchema,
          title: stringSchema,
        },
        ['itemId', 'title', 'body'],
      ),
      name: 'workflow.work_products.add',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const title = requireString(args.title, 'title');
      const body = requireString(args.body, 'body');
      const note = optionalString(args.note);
      const now = Date.now();
      const workProductId = createId('work-product');

      assertAgentCanAddWorkProduct(agentContext.agentId, item);

      item.workProducts.unshift({
        body,
        createdAt: now,
        id: workProductId,
        title,
      });
      item.updatedAt = now;
      prependWorkflowEvents(item, [
        ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
        createWorkflowEvent('note', `Added output "${title}".`, now, agentContext.agentName),
      ]);
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { workProductId };
    },
  },
];
