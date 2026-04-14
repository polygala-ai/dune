import { createId } from '@/shared/id';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import { createArtifactFolderName } from '@/shared/workflow/project-artifacts';
import { ensureProjectArtifactFolder } from '@/electron/main/workflow/project-artifacts';

import {
  optionalString,
  requireString,
  resolveProjectId,
  assertProjectExists,
} from './helpers';
import { presentItem } from './presenters';
import {
  compareItems,
  createWorkflowEvent,
  findItem,
  isWorkflowItemStatus,
  readWorkflowSnapshot,
  reindexProjectStatusGroup,
  touchProject,
  workflowItemStatuses,
  writeWorkflowSnapshot,
  type WorkflowItem,
} from './snapshot';
import {
  objectSchema,
  optionalStringSchema,
  stringSchema,
  workflowItemStatusSchema,
} from './schemas';
import {
  assertAgentCanCreateItem,
  assertAgentCanEditItem,
  assertAgentCanMoveItem,
} from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

export const itemTools: RegisteredTool[] = [
  {
    definition: {
      description: 'List work items for a project. Defaults to the current project.',
      inputSchema: objectSchema({ projectId: optionalStringSchema }),
      name: 'workflow.items.list',
    },
    handler: async ({ agentContext, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      assertProjectExists(snapshot, projectId);

      return {
        items: snapshot.items
          .filter((item) => item.projectId === projectId)
          .sort(compareItems)
          .map((item) => presentItem(snapshot, item)),
      };
    },
  },
  {
    definition: {
      description: 'Create a work item in a Dune project.',
      inputSchema: objectSchema(
        {
          brief: optionalStringSchema,
          projectId: optionalStringSchema,
          status: optionalStringSchema,
          title: stringSchema,
        },
        ['title'],
      ),
      name: 'workflow.items.create',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      const title = requireString(args.title, 'title');
      const brief = optionalString(args.brief) ?? '';
      const status = optionalString(args.status) ?? 'inbox';
      const now = Date.now();
      const itemId = createId('item');
      const artifactFolderName = createArtifactFolderName(title, itemId);

      assertProjectExists(snapshot, projectId);
      assertAgentCanCreateItem(status);
      const project = snapshot.projects.find((candidate) => candidate.id === projectId)!;

      const item = {
        artifactFolderName,
        brief,
        createdAt: now,
        id: itemId,
        primaryAgentId: null,
        projectId,
        sortOrder: snapshot.items.filter((item) => item.projectId === projectId && item.status === status).length,
        status,
        tasks: createDefaultTasks(now),
        title,
        updatedAt: now,
        workProducts: [],
        workflowEvents: [createWorkflowEvent('item', `Work item "${title}" was created.`, now, agentContext.agentName)],
      } satisfies WorkflowItem;

      snapshot.items.push(item);

      if (project.rootPath) {
        ensureProjectArtifactFolder(project.rootPath, artifactFolderName);
      }

      touchProject(snapshot, projectId, now);
      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { item: presentItem(snapshot, item), itemId };
    },
  },
  {
    definition: {
      description: 'Update a Dune work item.',
      inputSchema: objectSchema(
        {
          brief: optionalStringSchema,
          itemId: stringSchema,
          title: optionalStringSchema,
        },
        ['itemId'],
      ),
      name: 'workflow.items.update',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const title = optionalString(args.title);

      assertAgentCanEditItem(item);

      if (args.title !== undefined && !title) {
        throw new ToolHandlerError('validation-error', 'Work item title cannot be empty.');
      }

      if (title) {
        item.title = title;
      }

      if (args.brief !== undefined) {
        item.brief = optionalString(args.brief) ?? '';
      }

      item.updatedAt = Date.now();
      item.workflowEvents.unshift(
        createWorkflowEvent('item', 'Work item details were updated.', item.updatedAt, agentContext.agentName),
      );
      touchProject(snapshot, item.projectId, item.updatedAt);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { item: presentItem(snapshot, item) };
    },
  },
  {
    definition: {
      description: 'Move a Dune work item to a new status.',
      inputSchema: objectSchema(
        {
          index: { type: 'number' },
          itemId: stringSchema,
          status: workflowItemStatusSchema,
        },
        ['itemId', 'status'],
      ),
      name: 'workflow.items.move',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const status = requireString(args.status, 'status');

      if (!isWorkflowItemStatus(status)) {
        throw new ToolHandlerError(
          'validation-error',
          `Work item status must be one of: ${workflowItemStatuses.join(', ')}.`,
        );
      }

      const now = Date.now();
      const destinationItems = snapshot.items
        .filter((candidate) =>
          candidate.id !== item.id &&
          candidate.projectId === item.projectId &&
          candidate.status === status,
        )
        .sort(compareItems);
      const rawIndex = typeof args.index === 'number' && Number.isFinite(args.index)
        ? args.index
        : destinationItems.length;
      const index = Math.max(0, Math.min(rawIndex, destinationItems.length));
      const previousStatus = item.status;

      assertAgentCanMoveItem(agentContext.agentId, item, status);

      item.status = status;
      item.updatedAt = now;
      item.sortOrder = index;
      item.workflowEvents.unshift(
        createWorkflowEvent('item', `Work item moved to ${status}.`, now, agentContext.agentName),
      );

      // When an item is sent back to active (rejection), prepend fresh checklist
      if (status === 'active' && previousStatus === 'review') {
        item.tasks.unshift(...createDefaultTasks(now));
      }

      // Re-space the destination group so sortOrder stays unique.
      destinationItems.splice(index, 0, item);
      for (const [currentIndex, candidate] of destinationItems.entries()) {
        candidate.sortOrder = currentIndex;
      }

      if (previousStatus !== status) {
        reindexProjectStatusGroup(snapshot.items, item.projectId, previousStatus);
      }

      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { item: presentItem(snapshot, item) };
    },
  },
  {
    definition: {
      description: 'Add feedback to a Dune work item. Used by reviewers to approve, reject, or comment.',
      inputSchema: objectSchema(
        {
          feedback: stringSchema,
          itemId: stringSchema,
        },
        ['itemId', 'feedback'],
      ),
      name: 'workflow.items.add_feedback',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const feedback = requireString(args.feedback, 'feedback');
      const now = Date.now();

      item.workflowEvents.unshift(createWorkflowEvent('feedback', feedback, now, agentContext.agentName));
      item.updatedAt = now;
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { item: presentItem(snapshot, item) };
    },
  },
];
