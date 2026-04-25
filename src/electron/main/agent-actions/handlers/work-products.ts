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
import { ToolHandlerError, type RegisteredTool } from './types';

/** Returns the actor label for audit events emitted by agent actions. */
function auditActor(agentContext: { agentId?: string; agentName?: string }) {
  return agentContext.agentName ?? 'user';
}

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
    handler: async ({ agentContext, auditLog, onWorkflowChanged, workflowStore }, args) => {
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
      auditLog?.record({
        actor: auditActor(agentContext),
        actorType: 'agent',
        eventType: 'work_product.added',
        itemId: item.id,
        itemTitle: item.title,
        projectId: item.projectId,
        summary: `Added work product "${title}" to "${item.title}".`,
        details: { workProductId, workProductTitle: title },
      });
      return { workProductId };
    },
  },
  {
    definition: {
      description: 'Delete a work product from a Dune work item.',
      inputSchema: objectSchema(
        {
          itemId: stringSchema,
          note: optionalStringSchema,
          workProductId: stringSchema,
        },
        ['itemId', 'workProductId'],
      ),
      name: 'workflow.work_products.delete',
    },
    handler: async ({ agentContext, auditLog, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const workProductId = requireString(args.workProductId, 'workProductId');
      const product = item.workProducts.find((candidate) => candidate.id === workProductId) ?? null;
      const note = optionalString(args.note);

      assertAgentCanAddWorkProduct(agentContext.agentId, item);

      if (!product) {
        throw new ToolHandlerError('not-found', `Work product ${workProductId} not found.`);
      }

      const now = Date.now();

      item.workProducts = item.workProducts.filter((candidate) => candidate.id !== workProductId);
      item.updatedAt = now;
      prependWorkflowEvents(item, [
        ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
        createWorkflowEvent('note', `Deleted output "${product.title}".`, now, agentContext.agentName),
      ]);
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      auditLog?.record({
        actor: auditActor(agentContext),
        actorType: 'agent',
        eventType: 'work_product.deleted',
        itemId: item.id,
        itemTitle: item.title,
        projectId: item.projectId,
        summary: `Deleted work product "${product.title}" from "${item.title}".`,
        details: { workProductId, workProductTitle: product.title },
      });
      return { workProductId };
    },
  },
];
