// Tasks IPC tool handlers.

import { createId } from '@/shared/id';
import type { WorkflowTaskStatus } from '@/renderer/features/workflow/types';

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
import { assertAgentCanMutateTasks } from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

/** Lists task tools. */
export const taskTools: RegisteredTool[] = [
  {
    definition: {
      description: 'Add a task to a Dune work item.',
      inputSchema: objectSchema(
        {
          itemId: stringSchema,
          note: optionalStringSchema,
          title: stringSchema,
        },
        ['itemId', 'title'],
      ),
      name: 'workflow.tasks.add',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const note = optionalString(args.note);
      const title = requireString(args.title, 'title');
      const now = Date.now();
      const taskId = createId('task');

      assertAgentCanMutateTasks(agentContext.agentId, item);

      item.tasks.push({
        createdAt: now,
        id: taskId,
        notes: '',
        status: 'todo',
        title,
        updatedAt: now,
      });
      item.updatedAt = now;
      prependWorkflowEvents(item, [
        ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
        createWorkflowEvent('task', `Task "${title}" was added.`, now, agentContext.agentName),
      ]);
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { taskId };
    },
  },
  {
    definition: {
      description: 'Update a task on a Dune work item.',
      inputSchema: objectSchema(
        {
          itemId: stringSchema,
          note: optionalStringSchema,
          notes: optionalStringSchema,
          status: optionalStringSchema,
          taskId: stringSchema,
          title: optionalStringSchema,
        },
        ['itemId', 'taskId'],
      ),
      name: 'workflow.tasks.update',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const note = optionalString(args.note);
      const task = item.tasks.find((candidate) => candidate.id === requireString(args.taskId, 'taskId')) ?? null;

      assertAgentCanMutateTasks(agentContext.agentId, item);

      if (!task) {
        throw new ToolHandlerError('not-found', `Task ${String(args.taskId)} not found.`);
      }

      const title = optionalString(args.title);

      if (args.title !== undefined && !title) {
        throw new ToolHandlerError('validation-error', 'Task title cannot be empty.');
      }

      if (title) {
        task.title = title;
      }

      if (args.notes !== undefined) {
        task.notes = optionalString(args.notes) ?? '';
      }

      if (args.status !== undefined) {
        task.status = requireString(args.status, 'status') as WorkflowTaskStatus;
      }

      task.updatedAt = Date.now();
      item.updatedAt = task.updatedAt;
      prependWorkflowEvents(item, [
        ...(note ? [createWorkflowEvent('note', note, task.updatedAt, agentContext.agentName)] : []),
        createWorkflowEvent('task', 'Checklist updated.', task.updatedAt, agentContext.agentName),
      ]);
      touchProject(snapshot, item.projectId, task.updatedAt);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { task };
    },
  },
];
