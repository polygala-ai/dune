// Agents IPC tool handlers.

import { optionalString, requireString, resolveProjectId } from './helpers';
import { sanitizeAgent } from './presenters';
import { readWorkflowSnapshot, writeWorkflowSnapshot } from './snapshot';
import { objectSchema, optionalStringSchema, stringSchema } from './schemas';
import {
  assertAgentCanUpdateAgent,
  clearPrimaryAgentAssignments,
} from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

function buildDefaultUpdateNotice(
  editorName: string,
  responsibilities: string[],
): string {
  if (responsibilities.length === 0) {
    return `Your responsibilities were cleared by ${editorName}. You currently have no explicit responsibilities listed.`;
  }

  const lines = responsibilities.map((entry) => `- ${entry}`).join('\n');
  return `Your responsibilities were updated by ${editorName}. New list:\n${lines}\n\nReview your system prompt before the next turn.`;
}

/** Lists agent tools. */
export const agentTools: RegisteredTool[] = [
  {
    definition: {
      description: 'List agents in the current or specified project.',
      inputSchema: objectSchema({ projectId: optionalStringSchema }),
      name: 'agents.list',
    },
    handler: async ({ agentContext, getRuntimeController }, args) => {
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      return {
        agents: getRuntimeController().getSnapshot().agents
          .filter((agent) => agent.projectId === projectId)
          .map(sanitizeAgent),
      };
    },
  },
  {
    definition: {
      description: 'Get a Dune agent by ID.',
      inputSchema: objectSchema({ agentId: stringSchema }, ['agentId']),
      name: 'agents.get',
    },
    handler: async ({ getRuntimeController }, args) => {
      const agentId = requireString(args.agentId, 'agentId');
      const agent = getRuntimeController().getSnapshot().agents.find((candidate) => candidate.id === agentId) ?? null;

      if (!agent) {
        throw new ToolHandlerError('not-found', `Agent ${agentId} not found.`);
      }

      return { agent: sanitizeAgent(agent) };
    },
  },
  {
    definition: {
      description: 'Create a Dune agent. Defaults to the current project.',
      inputSchema: objectSchema(
        {
          channelId: optionalStringSchema,
          name: stringSchema,
          projectId: optionalStringSchema,
        },
        ['name'],
      ),
      name: 'agents.create',
    },
    handler: async ({ agentContext, getRuntimeController, workflowStore }, args) => {
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      const projectSnapshot = await readWorkflowSnapshot(workflowStore);
      const projectName = projectSnapshot.projects.find((candidate) => candidate.id === projectId)?.name ?? null;
      const projectRootPath = projectSnapshot.projects.find((candidate) => candidate.id === projectId)?.rootPath ?? null;
      const agentId = await getRuntimeController().createAgent({
        channelId: (optionalString(args.channelId) ?? 'dune-chat') as 'dune-chat' | 'telegram',
        name: requireString(args.name, 'name'),
        projectId,
        projectName,
        projectRootPath,
      });

      return { agentId };
    },
  },
  {
    definition: {
      description:
        'Update a Dune agent\'s responsibilities. After the update, a system-role notice is sent to the modified agent. Only responsibilities are mutable via this action.',
      inputSchema: objectSchema(
        {
          agentId: stringSchema,
          notice: optionalStringSchema,
          responsibilities: {
            items: { type: 'string' },
            type: 'array',
          },
        },
        ['agentId', 'responsibilities'],
      ),
      name: 'agents.update',
    },
    handler: async ({ agentContext, getRuntimeController }, args) => {
      const agentId = requireString(args.agentId, 'agentId');
      const rawResponsibilities = args.responsibilities;

      if (!Array.isArray(rawResponsibilities)) {
        throw new ToolHandlerError('validation-error', 'responsibilities must be an array of strings.');
      }

      const responsibilities = rawResponsibilities
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      const runtimeController = getRuntimeController();
      const target = runtimeController.getSnapshot().agents
        .find((candidate) => candidate.id === agentId) ?? null;

      if (!target) {
        throw new ToolHandlerError('not-found', `Agent ${agentId} not found.`);
      }

      assertAgentCanUpdateAgent(agentContext.agentId, agentContext.projectId, target);

      const nextDefinition = {
        archetype: target.definition.archetype,
        responsibilities,
      };

      await runtimeController.updateAgentDefinition(agentId, nextDefinition);

      const noticeBody = optionalString(args.notice) ?? buildDefaultUpdateNotice(
        agentContext.agentName,
        responsibilities,
      );
      await runtimeController.postSystemMessage(agentId, noticeBody);

      const updatedAgent = runtimeController.getSnapshot().agents
        .find((candidate) => candidate.id === agentId) ?? target;

      return { agent: sanitizeAgent({ ...updatedAgent, definition: nextDefinition }) };
    },
  },
  {
    definition: {
      description: 'Delete a Dune agent by ID.',
      inputSchema: objectSchema({ agentId: stringSchema }, ['agentId']),
      name: 'agents.delete',
    },
    handler: async ({ getRuntimeController, onWorkflowChanged, workflowStore }, args) => {
      const agentId = requireString(args.agentId, 'agentId');
      await getRuntimeController().deleteAgent(agentId);

      const snapshot = await readWorkflowSnapshot(workflowStore);
      const now = Date.now();
      const didClear = clearPrimaryAgentAssignments(snapshot, agentId, now);

      if (didClear) {
        await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      }

      return { success: true };
    },
  },
];
