// Items IPC tool handlers.

import { createId } from '@/shared/id';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';
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
  prependWorkflowEvents,
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
  assertAgentCanSetPrimaryAgent,
} from './validators';
import { ToolHandlerError, type RegisteredTool } from './types';

/** Lists item tools. */
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
          note: optionalStringSchema,
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
      const note = optionalString(args.note);
      const status = optionalString(args.status) ?? 'inbox';
      const now = Date.now();
      const itemId = createId('item');
      const artifactFolderName = createArtifactFolderName(title, itemId);

      assertProjectExists(snapshot, projectId);
      assertAgentCanCreateItem(status);
      const project = snapshot.projects.find((candidate) => candidate.id === projectId)!;

      const item = {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName,
        brief,
        createdAt: now,
        id: itemId,
        primaryAgentId: null,
        projectId,
        scheduledTaskId: null,
        sortOrder: snapshot.items.filter((item) => item.projectId === projectId && item.status === status).length,
        status,
        tasks: createDefaultTasks(now),
        title,
        updatedAt: now,
        workProducts: [],
        workflowEvents: [
          ...(note
            ? [createWorkflowEvent('note', note, now, agentContext.agentName)]
            : []),
          createWorkflowEvent('item', `Work item "${title}" was created.`, now, agentContext.agentName),
        ],
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
      description: 'Update a Dune work item. Supports title/brief edits (inbox only) and primaryAgentId assignment (any status except done).',
      inputSchema: objectSchema(
        {
          brief: optionalStringSchema,
          itemId: stringSchema,
          note: optionalStringSchema,
          primaryAgentId: { type: ['string', 'null'] },
          title: optionalStringSchema,
        },
        ['itemId'],
      ),
      name: 'workflow.items.update',
    },
    handler: async ({ agentContext, getRuntimeController, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const note = optionalString(args.note);
      const title = optionalString(args.title);
      const now = Date.now();

      const touchesDetails = args.title !== undefined || args.brief !== undefined;
      const touchesAssignment = args.primaryAgentId !== undefined;

      if (touchesDetails) {
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

        prependWorkflowEvents(item, [
          ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
          createWorkflowEvent('item', 'Work item details were updated.', now, agentContext.agentName),
        ]);
      }

      if (touchesAssignment) {
        assertAgentCanSetPrimaryAgent(item);

        const nextAgentId = args.primaryAgentId;

        if (nextAgentId === null) {
          item.primaryAgentId = null;
          prependWorkflowEvents(item, [
            ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
            createWorkflowEvent('assignment', 'Primary agent cleared.', now, agentContext.agentName),
          ]);
        } else if (typeof nextAgentId === 'string') {
          const agent = getRuntimeController().getSnapshot().agents.find((candidate) => candidate.id === nextAgentId);

          if (!agent) {
            throw new ToolHandlerError('not-found', `Agent ${nextAgentId} not found.`);
          }

          item.primaryAgentId = nextAgentId;
          prependWorkflowEvents(item, [
            ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
            createWorkflowEvent('assignment', `Primary agent set to "${agent.name}".`, now, agentContext.agentName),
          ]);
        } else {
          throw new ToolHandlerError('validation-error', 'primaryAgentId must be a string or null.');
        }
      }

      if (!touchesDetails && !touchesAssignment) {
        return { item: presentItem(snapshot, item) };
      }

      item.updatedAt = now;
      touchProject(snapshot, item.projectId, now);

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
          note: optionalStringSchema,
          status: workflowItemStatusSchema,
        },
        ['itemId', 'status'],
      ),
      name: 'workflow.items.move',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
      const note = optionalString(args.note);
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
      prependWorkflowEvents(item, [
        ...(note ? [createWorkflowEvent('note', note, now, agentContext.agentName)] : []),
        createWorkflowEvent('item', `Work item moved to ${status}.`, now, agentContext.agentName),
      ]);

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
