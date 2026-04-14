import { requireString } from './helpers';
import {
  createWorkflowEvent,
  findItem,
  readWorkflowSnapshot,
  touchProject,
  writeWorkflowSnapshot,
} from './snapshot';
import { objectSchema, stringSchema } from './schemas';
import { assertAgentCanSetPrimaryAgent } from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

export const assignmentTools: RegisteredTool[] = [
  {
    definition: {
      description: 'Assign a primary agent to a Dune work item.',
      inputSchema: objectSchema(
        {
          agentId: stringSchema,
          itemId: stringSchema,
        },
        ['itemId', 'agentId'],
      ),
      name: 'workflow.assignments.set_primary_agent',
    },
    handler: async ({ agentContext, getRuntimeController, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const agentId = requireString(args.agentId, 'agentId');
      const agent = getRuntimeController().getSnapshot().agents.find((candidate) => candidate.id === agentId) ?? null;

      if (!agent) {
        throw new ToolHandlerError('not-found', `Agent ${agentId} not found.`);
      }

      const now = Date.now();
      assertAgentCanSetPrimaryAgent(item);
      item.primaryAgentId = agentId;
      item.updatedAt = now;
      item.workflowEvents.unshift(
        createWorkflowEvent('assignment', `Primary agent set to "${agent.name}".`, now, agentContext.agentName),
      );
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);

      return { success: true };
    },
  },
  {
    definition: {
      description: 'Clear the primary agent on a Dune work item.',
      inputSchema: objectSchema(
        {
          itemId: stringSchema,
        },
        ['itemId'],
      ),
      name: 'workflow.assignments.clear_primary_agent',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const now = Date.now();
      assertAgentCanSetPrimaryAgent(item);

      item.primaryAgentId = null;
      item.updatedAt = now;
      item.workflowEvents.unshift(
        createWorkflowEvent('assignment', 'Primary agent cleared.', now, agentContext.agentName),
      );
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { success: true };
    },
  },
];
