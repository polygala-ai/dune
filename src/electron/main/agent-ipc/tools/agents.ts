// Agents IPC tool handlers.

import { optionalString, requireString, resolveProjectId } from './helpers';
import { sanitizeAgent } from './presenters';
import { readWorkflowSnapshot, writeWorkflowSnapshot } from './snapshot';
import { objectSchema, optionalStringSchema, stringSchema } from './schemas';
import { clearPrimaryAgentAssignments } from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

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
  {
    definition: {
      description: 'Ensure the current or specified project has a project-main agent.',
      inputSchema: objectSchema({
        projectId: optionalStringSchema,
        projectName: optionalStringSchema,
      }),
      name: 'agents.ensure_project_main',
    },
    handler: async ({ agentContext, getRuntimeController, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      const project = snapshot.projects.find((candidate) => candidate.id === projectId) ?? null;
      const projectName = optionalString(args.projectName) ?? project?.name ?? null;

      if (!projectName) {
        throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
      }

      const agentId = await getRuntimeController().ensureProjectMainAgent(
        projectId,
        projectName,
        project?.rootPath ?? null,
      );
      return { agentId };
    },
  },
];
