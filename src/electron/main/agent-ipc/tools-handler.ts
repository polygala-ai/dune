import { spawn } from 'node:child_process';

import type { AppStorage } from '@/electron/main/storage/app-storage';
import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { CodingEngineEvent, CodingEngineId } from '@/renderer/features/agents/types';
import {
  ensureProjectArtifactFolder,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';
import { createId, createProjectId } from '@/shared/id';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import type {
  IpcMessage,
  ToolDefinition,
} from '@/shared/agent-ipc/types';
import {
  createArtifactFolderName,
  normalizeProjectRootPath,
  resolveMountedItemArtifactPath,
} from '@/shared/workflow/project-artifacts';
import type {
  ToolHandlerContext,
  ToolMessageHandler,
} from './agent-ipc-connection';

const defaultProjectColors = ['#A86D46', '#7A8B5D', '#4F7A78', '#9D6A71', '#6C69A6'] as const;
const workflowItemStatuses = ['inbox', 'ready', 'active', 'review', 'done'] as const;
type WorkflowItemStatus = (typeof workflowItemStatuses)[number];

interface WorkflowSnapshot {
  items: WorkflowItem[];
  projects: WorkflowProject[];
  selectedItemId: string | null;
  selectedProjectFilter: string;
  selectedProjectId: string | null;
  selectedProjectView: string;
}

interface WorkflowItem {
  artifactFolderName: string;
  brief: string;
  createdAt: number;
  id: string;
  primaryAgentId: string | null;
  projectId: string;
  sortOrder: number;
  status: string;
  tasks: WorkflowTask[];
  title: string;
  updatedAt: number;
  workProducts: WorkflowWorkProduct[];
  workflowEvents: WorkflowEvent[];
}

interface WorkflowTask {
  createdAt: number;
  id: string;
  notes: string;
  status: string;
  title: string;
  updatedAt: number;
}

interface WorkflowWorkProduct {
  body: string;
  createdAt: number;
  id: string;
  title: string;
}

interface WorkflowEvent {
  actor?: string;
  createdAt: number;
  description: string;
  id: string;
  kind: string;
}

interface WorkflowProject {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  rootPath: string | null;
  updatedAt: number;
}

interface ToolHandlerOptions {
  getRuntimeController: () => DesktopRuntimeController;
  onCodingEngineEvent?: (agentId: string, event: CodingEngineEvent) => void;
  onWorkflowChanged: () => void;
  workflowStore: AppStorage;
}

interface ToolServices extends ToolHandlerOptions {
  agentContext: ToolHandlerContext;
}

type RuntimeSnapshot = ReturnType<DesktopRuntimeController['getSnapshot']>;
type RuntimeAgent = RuntimeSnapshot['agents'][number];

interface RegisteredTool {
  definition: ToolDefinition;
  handler: (services: ToolServices, args: Record<string, unknown>) => Promise<unknown>;
}

class ToolHandlerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    additionalProperties: false,
    properties,
    required,
    type: 'object',
  };
}

const emptyObjectSchema = objectSchema({});
const stringSchema = { type: 'string' } as const;
const optionalStringSchema = { type: 'string' } as const;
const workflowItemStatusSchema = {
  description: 'Destination lane for the work item.',
  enum: [...workflowItemStatuses],
  type: 'string',
} as const;

const registeredTools: RegisteredTool[] = [
  {
    definition: {
      description: 'List Dune projects.',
      inputSchema: emptyObjectSchema,
      name: 'workflow.projects.list',
    },
    handler: async ({ workflowStore }) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      return { projects: snapshot.projects.map((project) => presentProject(project)) };
    },
  },
  {
    definition: {
      description: 'Get a Dune project. Defaults to the current project.',
      inputSchema: objectSchema({ projectId: optionalStringSchema }),
      name: 'workflow.projects.get',
    },
    handler: async ({ agentContext, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      const project = snapshot.projects.find((candidate) => candidate.id === projectId) ?? null;

      if (!project) {
        throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
      }

      return { project: presentProject(project) };
    },
  },
  {
    definition: {
      description: 'Create a Dune project.',
      inputSchema: objectSchema(
        { description: optionalStringSchema, name: stringSchema, rootPath: optionalStringSchema },
        ['name'],
      ),
      name: 'workflow.projects.create',
    },
    handler: async ({ onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const name = requireString(args.name, 'name');
      const now = Date.now();
      const projectId = createProjectId();
      const rootPath = optionalString(args.rootPath);
      const normalizedRootPath = rootPath ? prepareProjectRootPath(rootPath, []) : null;

      const project = {
        color: defaultProjectColors[snapshot.projects.length % defaultProjectColors.length] ?? '#A86D46',
        createdAt: now,
        description: optionalString(args.description) ?? '',
        id: projectId,
        name,
        rootPath: normalizedRootPath,
        updatedAt: now,
      } satisfies WorkflowProject;

      snapshot.projects.push(project);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { project: presentProject(project), projectId };
    },
  },
  {
    definition: {
      description: 'Update a Dune project. Defaults to the current project.',
      inputSchema: objectSchema({
        description: optionalStringSchema,
        name: optionalStringSchema,
        projectId: optionalStringSchema,
        rootPath: optionalStringSchema,
      }),
      name: 'workflow.projects.update',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);
      const project = snapshot.projects.find((candidate) => candidate.id === projectId) ?? null;

      if (!project) {
        throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
      }

      const name = optionalString(args.name);
      const rootPath = optionalString(args.rootPath);

      if (args.name !== undefined && !name) {
        throw new ToolHandlerError('validation-error', 'Project name cannot be empty.');
      }

      if (name) {
        project.name = name;
      }

      if (args.description !== undefined) {
        project.description = optionalString(args.description) ?? '';
      }

      if (args.rootPath !== undefined) {
        if (project.rootPath !== null) {
          throw new ToolHandlerError(
            'validation-error',
            'Project folder is fixed once it has been set.',
          );
        }

        const artifactFolderNames = snapshot.items
          .filter((item) => item.projectId === projectId)
          .map((item) => item.artifactFolderName);

        project.rootPath = rootPath
          ? prepareProjectRootPath(rootPath, artifactFolderNames)
          : null;
      }

      project.updatedAt = Date.now();

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { project: presentProject(project) };
    },
  },
  {
    definition: {
      description: 'Delete a Dune project and its agents. Defaults to the current project.',
      inputSchema: objectSchema({ projectId: optionalStringSchema }),
      name: 'workflow.projects.delete',
    },
    handler: async ({ agentContext, getRuntimeController, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const projectId = resolveProjectId(args.projectId, agentContext.projectId);

      if (!snapshot.projects.some((candidate) => candidate.id === projectId)) {
        throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
      }

      const runtimeController = getRuntimeController();
      const projectAgents = runtimeController.getSnapshot().agents
        .filter((agent) => agent.projectId === projectId);

      await Promise.all(projectAgents.map((agent) => runtimeController.deleteAgent(agent.id)));

      snapshot.items = snapshot.items.filter((item) => item.projectId !== projectId);
      snapshot.projects = snapshot.projects.filter((project) => project.id !== projectId);

      if (snapshot.selectedProjectId === projectId) {
        snapshot.selectedProjectId = snapshot.projects[0]?.id ?? null;
        snapshot.selectedItemId = null;
        snapshot.selectedProjectView = 'board';
      }

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { success: true };
    },
  },
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
      description: 'Add a task to a Dune work item.',
      inputSchema: objectSchema(
        {
          itemId: stringSchema,
          title: stringSchema,
        },
        ['itemId', 'title'],
      ),
      name: 'workflow.tasks.add',
    },
    handler: async ({ agentContext, onWorkflowChanged, workflowStore }, args) => {
      const snapshot = await readWorkflowSnapshot(workflowStore);
      const item = findItem(snapshot, requireString(args.itemId, 'itemId'));
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
      item.workflowEvents.unshift(createWorkflowEvent('task', `Task "${title}" was added.`, now, agentContext.agentName));
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
        task.status = requireString(args.status, 'status');
      }

      task.updatedAt = Date.now();
      item.updatedAt = task.updatedAt;
      item.workflowEvents.unshift(createWorkflowEvent('task', 'Checklist updated.', task.updatedAt, agentContext.agentName));
      touchProject(snapshot, item.projectId, task.updatedAt);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { task };
    },
  },
  {
    definition: {
      description: 'Add a work product to a Dune work item.',
      inputSchema: objectSchema(
        {
          body: stringSchema,
          itemId: stringSchema,
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
      item.workflowEvents.unshift(createWorkflowEvent('note', `Added output "${title}".`, now, agentContext.agentName));
      touchProject(snapshot, item.projectId, now);

      await writeWorkflowSnapshot(workflowStore, snapshot, onWorkflowChanged);
      return { workProductId };
    },
  },
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
      description: 'Start a coding task with Claude Code (Anthropic). Returns a jobId immediately — use coding_engine.poll to check progress. Claude Code can read files, write files, run shell commands, and use other tools autonomously. To resume a previous session, pass args: ["--resume", "<session_id>"].',
      inputSchema: objectSchema(
        {
          prompt: { ...stringSchema, description: 'What to ask Claude Code to do' },
          args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI arguments (e.g. ["--model", "sonnet"], ["--resume", "<session_id>"])' },
          cwd: { ...optionalStringSchema, description: 'Working directory for the coding engine process. Affects session storage and file access.' },
        },
        ['prompt'],
      ),
      name: 'coding_engine.claude_code',
    },
    handler: async (services, args) => {
      const extraArgs = Array.isArray(args.args)
        ? (args.args as unknown[]).filter((a): a is string => typeof a === 'string')
        : undefined;
      return startCodingEngine(services, 'claude-code', requireString(args.prompt, 'prompt'), extraArgs, optionalString(args.cwd) ?? undefined);
    },
  },
  {
    definition: {
      description: 'Start a coding task with Codex (OpenAI). Returns a jobId immediately — use coding_engine.poll to check progress. Codex runs in a sandbox with full-auto approval.',
      inputSchema: objectSchema(
        {
          prompt: { ...stringSchema, description: 'What to ask Codex to do' },
          args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI arguments' },
          cwd: { ...optionalStringSchema, description: 'Working directory for the coding engine process.' },
        },
        ['prompt'],
      ),
      name: 'coding_engine.codex',
    },
    handler: async (services, args) => {
      const extraArgs = Array.isArray(args.args)
        ? (args.args as unknown[]).filter((a): a is string => typeof a === 'string')
        : undefined;
      return startCodingEngine(services, 'codex', requireString(args.prompt, 'prompt'), extraArgs, optionalString(args.cwd) ?? undefined);
    },
  },
  {
    definition: {
      description: 'Poll a running coding engine job. Returns current status, steps taken so far, and the result when complete. Call this periodically after starting a coding engine job.',
      inputSchema: objectSchema(
        { jobId: { ...stringSchema, description: 'The jobId returned by coding_engine.claude_code or coding_engine.codex' } },
        ['jobId'],
      ),
      name: 'coding_engine.poll',
    },
    handler: async (_services, args) => {
      return pollCodingEngineJob(requireString(args.jobId, 'jobId'));
    },
  },
];

const toolsByName = new Map(
  registeredTools.map((tool) => [tool.definition.name, tool] as const),
);

// ---------------------------------------------------------------------------
// Coding engine — async job pattern
// ---------------------------------------------------------------------------

const CODING_ENGINE_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

interface CodingEngineJob {
  jobId: string;
  engineId: CodingEngineId;
  status: 'running' | 'completed' | 'error';
  output: string;
  steps: string[];
  result?: string;
  error?: string;
  startedAt: number;
}

/** Global registry of running/completed coding engine jobs. */
const engineJobs = new Map<string, CodingEngineJob>();

function createEngineEventId(): string {
  return `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emitEngineEvent(
  services: ToolServices,
  event: CodingEngineEvent,
) {
  services.onCodingEngineEvent?.(services.agentContext.agentId, event);
}

function buildEngineCommand(
  engineId: CodingEngineId,
  prompt: string,
  extraArgs?: string[],
): { command: string; args: string[] } {
  if (engineId === 'claude-code') {
    const baseArgs = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (extraArgs && extraArgs.length > 0) {
      return { command: 'claude', args: [...baseArgs, ...extraArgs] };
    }

    return {
      command: 'claude',
      args: [...baseArgs, '--permission-mode', 'bypassPermissions'],
    };
  }

  const codexBaseArgs = ['exec', prompt, '--json'];

  if (extraArgs && extraArgs.length > 0) {
    return { command: 'codex', args: [...codexBaseArgs, ...extraArgs] };
  }

  return {
    command: 'codex',
    args: [...codexBaseArgs, '--full-auto'],
  };
}

function parseStreamedSteps(
  engineId: CodingEngineId,
  line: string,
): string | null {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;

    if (engineId === 'claude-code') {
      if (event.type === 'assistant' && typeof event.message === 'object' && event.message !== null) {
        const message = event.message as Record<string, unknown>;
        if (Array.isArray(message.content)) {
          for (const block of message.content) {
            if (typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'tool_use') {
              const toolBlock = block as Record<string, unknown>;
              return `${String(toolBlock.name ?? 'tool')}`;
            }
          }
        }
      }
      if (event.type === 'result') {
        return null;
      }
    }

    if (engineId === 'codex') {
      const type = String(event.type ?? '');
      if (type === 'item.completed' || type.startsWith('item.')) {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === 'function_call') {
          return `${String(item.name ?? 'tool')}`;
        }
      }
    }
  } catch {
    // Not valid JSON, skip
  }

  return null;
}

function extractFinalResult(
  engineId: CodingEngineId,
  allOutput: string,
): string {
  const lines = allOutput.trim().split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;

      if (engineId === 'claude-code' && event.type === 'result') {
        return String((event as Record<string, unknown>).result ?? 'Completed');
      }

      if (engineId === 'codex' && event.type === 'turn.completed') {
        return 'Completed';
      }
    } catch {
      // Not JSON
    }
  }

  return lines.filter(Boolean).pop() ?? 'Completed';
}

function startCodingEngine(
  services: ToolServices,
  engineId: CodingEngineId,
  prompt: string,
  extraArgs?: string[],
  cwd?: string,
): { jobId: string; status: 'running' } {
  const snapshot = services.getRuntimeController().getSnapshot();
  const engine = snapshot.codingEngines.find((e) => e.id === engineId);

  if (!engine?.available) {
    const label = engineId === 'claude-code' ? 'Claude Code' : 'Codex';
    throw new ToolHandlerError('unavailable', `${label} is not installed or not found in PATH.`);
  }

  const { command, args } = buildEngineCommand(engineId, prompt, extraArgs);
  const jobId = createJobId();

  const job: CodingEngineJob = {
    jobId,
    engineId,
    status: 'running',
    output: '',
    steps: [],
    startedAt: Date.now(),
  };
  engineJobs.set(jobId, job);

  emitEngineEvent(services, {
    id: createEngineEventId(),
    engineId,
    kind: 'started',
    prompt: prompt ?? '',
    timestamp: Date.now(),
  });

  // Fire and forget — the job runs in the background.
  // No explicit cwd: spawn inherits the Electron main process cwd,
  // which is the project root. This keeps session IDs resumable.
  const seenSteps = new Set<string>();
  const child = spawn(command, args, {
    cwd: cwd ?? undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CODING_ENGINE_TIMEOUT_MS,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    job.output += text;

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;

      const stepLabel = parseStreamedSteps(engineId, line);

      if (stepLabel && !seenSteps.has(stepLabel)) {
        seenSteps.add(stepLabel);
        job.steps.push(stepLabel);
        emitEngineEvent(services, {
          id: createEngineEventId(),
          engineId,
          kind: 'step',
          stepLabel,
          timestamp: Date.now(),
        });
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    job.output += chunk.toString();
  });

  child.on('close', (code) => {
    if (code === 0) {
      const result = extractFinalResult(engineId, job.output);
      job.status = 'completed';
      job.result = result;
      emitEngineEvent(services, {
        id: createEngineEventId(),
        engineId,
        kind: 'completed',
        result,
        timestamp: Date.now(),
      });
    } else {
      const errorMessage = `Process exited with code ${code}`;
      job.status = 'error';
      job.error = errorMessage;
      emitEngineEvent(services, {
        id: createEngineEventId(),
        engineId,
        kind: 'error',
        error: errorMessage,
        timestamp: Date.now(),
      });
    }
  });

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    emitEngineEvent(services, {
      id: createEngineEventId(),
      engineId,
      kind: 'error',
      error: err.message,
      timestamp: Date.now(),
    });
  });

  return { jobId, status: 'running' };
}

function pollCodingEngineJob(jobId: string): {
  status: 'running' | 'completed' | 'error';
  engineId: CodingEngineId;
  steps: string[];
  output: string;
  result?: string;
  error?: string;
} {
  const job = engineJobs.get(jobId);
  if (!job) {
    throw new ToolHandlerError('not-found', `Job ${jobId} not found.`);
  }

  const poll: {
    status: 'running' | 'completed' | 'error';
    engineId: CodingEngineId;
    steps: string[];
    output: string;
    result?: string;
    error?: string;
  } = {
    status: job.status,
    engineId: job.engineId,
    steps: job.steps,
    output: job.output,
  };

  if (job.result !== undefined) poll.result = job.result;
  if (job.error !== undefined) poll.error = job.error;

  return poll;
}

export function createToolHandler(
  options: ToolHandlerOptions,
): (agentContext: ToolHandlerContext) => ToolMessageHandler {
  return (agentContext: ToolHandlerContext) => (
    msg: IpcMessage,
    fileId: string,
    replyFn: (reply: IpcMessage) => void,
  ) => {
    void handleToolMessage(options, agentContext, msg, fileId, replyFn);
  };
}

async function handleToolMessage(
  options: ToolHandlerOptions,
  agentContext: ToolHandlerContext,
  msg: IpcMessage,
  _fileId: string,
  replyFn: (reply: IpcMessage) => void,
): Promise<void> {
  try {
    if (msg.type === 'tools/list') {
      replyFn({
        type: 'tools/list-result',
        payload: {
          tools: registeredTools.map((tool) => tool.definition),
        },
      });
      return;
    }

    if (msg.type !== 'tools/call') {
      throw new ToolHandlerError('unknown-type', `Unknown message type: ${msg.type}`);
    }

    const payload = readRecord(msg.payload, 'payload');
    const name = requireString(payload.name, 'name');
    const argumentsPayload = payload.arguments === undefined
      ? {}
      : readRecord(payload.arguments, 'arguments');
    const tool = toolsByName.get(name);

    if (!tool) {
      throw new ToolHandlerError('not-found', `Unknown tool: ${name}`);
    }

    const result = await tool.handler({
      ...options,
      agentContext,
    }, argumentsPayload);

    replyFn({
      type: 'tools/call-result',
      payload: {
        name,
        result,
      },
    });
  } catch (error) {
    replyFn(toErrorMessage(error));
  }
}

function toErrorMessage(error: unknown): IpcMessage<'error'> {
  if (error instanceof ToolHandlerError) {
    return {
      type: 'error',
      payload: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return {
    type: 'error',
    payload: {
      code: 'internal-error',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function createEmptyWorkflowSnapshot(): WorkflowSnapshot {
  return {
    items: [],
    projects: [],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: null,
    selectedProjectView: 'board',
  };
}

async function readWorkflowSnapshot(store: AppStorage): Promise<WorkflowSnapshot> {
  const snapshot = await store.get<WorkflowSnapshot>('snapshot');

  return snapshot ? cloneWorkflowSnapshot(snapshot) : createEmptyWorkflowSnapshot();
}

async function writeWorkflowSnapshot(
  store: AppStorage,
  snapshot: WorkflowSnapshot,
  onWorkflowChanged: () => void,
): Promise<void> {
  normalizeWorkflowSnapshot(snapshot);
  await store.set('snapshot', snapshot);
  onWorkflowChanged();
}

function cloneWorkflowSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    items: snapshot.items.map((item) => ({
      ...item,
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : createArtifactFolderName(item.title, item.id),
      tasks: item.tasks.map((task) => ({ ...task })),
      workProducts: item.workProducts.map((workProduct) => ({ ...workProduct })),
      workflowEvents: item.workflowEvents.map((event) => ({ ...event })),
    })),
    projects: snapshot.projects.map((project) => ({
      ...project,
      rootPath: normalizeProjectRootPath(project.rootPath),
    })),
    selectedItemId: snapshot.selectedItemId,
    selectedProjectFilter: snapshot.selectedProjectFilter,
    selectedProjectId: snapshot.selectedProjectId,
    selectedProjectView: snapshot.selectedProjectView,
  };
}

function normalizeWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
  for (const project of snapshot.projects) {
    project.rootPath = normalizeProjectRootPath(project.rootPath);
  }

  for (const item of snapshot.items) {
    item.status = isWorkflowItemStatus(item.status) ? item.status : 'inbox';
    item.artifactFolderName =
      typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
        ? item.artifactFolderName.trim()
        : createArtifactFolderName(item.title, item.id);
  }

  for (const project of snapshot.projects) {
    const statuses = new Set(
      snapshot.items
        .filter((item) => item.projectId === project.id)
        .map((item) => item.status),
    );

    for (const status of statuses) {
      reindexProjectStatusGroup(snapshot.items, project.id, status);
    }
  }

  if (snapshot.selectedProjectId && !snapshot.projects.some((project) => project.id === snapshot.selectedProjectId)) {
    snapshot.selectedProjectId = snapshot.projects[0]?.id ?? null;
  }

  if (
    snapshot.selectedItemId &&
    !snapshot.items.some((item) => item.id === snapshot.selectedItemId)
  ) {
    snapshot.selectedItemId = null;
  }

  if (!snapshot.selectedProjectFilter) {
    snapshot.selectedProjectFilter = 'all';
  }

  if (!snapshot.selectedProjectView) {
    snapshot.selectedProjectView = 'board';
  }
}

function isWorkflowItemStatus(value: string): value is WorkflowItemStatus {
  return workflowItemStatuses.includes(value as WorkflowItemStatus);
}

function compareItems(left: WorkflowItem, right: WorkflowItem): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return right.updatedAt - left.updatedAt;
}

function reindexProjectStatusGroup(
  items: WorkflowItem[],
  projectId: string,
  status: string,
): void {
  items
    .filter((item) => item.projectId === projectId && item.status === status)
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.updatedAt - right.updatedAt
        : left.sortOrder - right.sortOrder,
    )
    .forEach((item, index) => {
      item.sortOrder = index;
    });
}

function createWorkflowEvent(kind: string, description: string, createdAt: number, actor?: string): WorkflowEvent {
  const event: WorkflowEvent = {
    createdAt,
    description,
    id: createId('event'),
    kind,
  };

  if (actor) {
    event.actor = actor;
  }

  return event;
}

function touchProject(snapshot: WorkflowSnapshot, projectId: string, updatedAt: number): void {
  for (const project of snapshot.projects) {
    if (project.id === projectId) {
      project.updatedAt = updatedAt;
    }
  }
}

function findItem(snapshot: WorkflowSnapshot, itemId: string): WorkflowItem {
  const item = snapshot.items.find((candidate) => candidate.id === itemId) ?? null;

  if (!item) {
    throw new ToolHandlerError('not-found', `Item ${itemId} not found.`);
  }

  return item;
}

function assertAgentCanCreateItem(status: string) {
  if (status !== 'inbox' && status !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents can only create work items in inbox or ready.',
    );
  }
}

function assertAgentCanEditItem(item: WorkflowItem) {
  if (item.status !== 'inbox') {
    throw new ToolHandlerError(
      'validation-error',
      'Only inbox work items can be edited by agents.',
    );
  }
}

function assertAgentCanMoveItem(
  agentId: string,
  item: WorkflowItem,
  nextStatus: WorkflowItemStatus,
) {
  // Only humans can move items to done (final approval gate).
  if (nextStatus === 'done') {
    throw new ToolHandlerError(
      'validation-error',
      'Only humans can move work items into done.',
    );
  }

  // Agents can move review → active (rejection with feedback) but not review → other.
  if (item.status === 'review' && nextStatus !== 'active') {
    throw new ToolHandlerError(
      'validation-error',
      'Review items can only be moved back to active (rejection) by agents.',
    );
  }

  if (item.status === 'done') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents cannot move work items out of done.',
    );
  }

  if (item.status === 'inbox' && nextStatus !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Inbox items can only be moved to ready by agents.',
    );
  }

  if (item.status === 'ready') {
    if (nextStatus !== 'active') {
      throw new ToolHandlerError(
        'validation-error',
        'Ready work items can only move to active.',
      );
    }

    assertAssignedWorker(agentId, item, 'claim ready work items');
    return;
  }

  if (item.status === 'active') {
    if (nextStatus !== 'review') {
      throw new ToolHandlerError(
        'validation-error',
        'Active work items can only move to review.',
      );
    }

    assertAssignedWorker(agentId, item, 'move active work items to review');
    return;
  }
}

function assertAgentCanMutateTasks(agentId: string, item: WorkflowItem) {
  if (item.status === 'inbox') {
    return;
  }

  if (item.status === 'active') {
    assertAssignedWorker(agentId, item, 'update tasks on active work items');
    return;
  }

  throw new ToolHandlerError(
    'validation-error',
    'Agents can only change tasks while a work item is in inbox or active.',
  );
}

function assertAgentCanAddWorkProduct(agentId: string, item: WorkflowItem) {
  if (item.status !== 'active') {
    throw new ToolHandlerError(
      'validation-error',
      'Agents can only add work products while a work item is active.',
    );
  }

  assertAssignedWorker(agentId, item, 'add work products to active work items');
}

function assertAgentCanSetPrimaryAgent(item: WorkflowItem) {
  if (item.status !== 'ready') {
    throw new ToolHandlerError(
      'validation-error',
      'Primary agent assignment can only change while a work item is in ready.',
    );
  }
}

function assertAssignedWorker(agentId: string, item: WorkflowItem, action: string) {
  if (item.primaryAgentId !== agentId) {
    throw new ToolHandlerError(
      'validation-error',
      `Only the assigned worker can ${action}.`,
    );
  }
}

function clearPrimaryAgentAssignments(
  snapshot: WorkflowSnapshot,
  agentId: string,
  timestamp: number,
): boolean {
  let cleared = false;

  for (const item of snapshot.items) {
    if (item.primaryAgentId === agentId) {
      item.primaryAgentId = null;
      item.updatedAt = timestamp;
      item.workflowEvents.unshift(
        createWorkflowEvent('assignment', 'Primary agent cleared.', timestamp),
      );
      touchProject(snapshot, item.projectId, timestamp);
      cleared = true;
    }
  }

  return cleared;
}

function presentProject(project: WorkflowProject) {
  return {
    ...project,
    rootPath: normalizeProjectRootPath(project.rootPath),
  };
}

function presentItem(snapshot: WorkflowSnapshot, item: WorkflowItem) {
  const project = snapshot.projects.find((candidate) => candidate.id === item.projectId) ?? null;

  return {
    ...item,
    artifactPath: resolveMountedItemArtifactPath(project?.rootPath ?? null, item.artifactFolderName),
  };
}

function sanitizeAgent(agent: RuntimeAgent) {
  return {
    id: agent.id,
    name: agent.name,
    projectId: agent.projectId,
    role: agent.role,
    status: agent.status,
    updatedAt: agent.updatedAt,
  };
}

function sanitizeRuntimeSnapshot(snapshot: RuntimeSnapshot, projectId: string) {
  return {
    agents: snapshot.agents
      .filter((agent) => agent.projectId === projectId)
      .map(sanitizeAgent),
    isStreaming: snapshot.isStreaming,
    runtimeInfo: snapshot.runtimeInfo,
  };
}

function assertProjectExists(snapshot: WorkflowSnapshot, projectId: string): void {
  if (!snapshot.projects.some((project) => project.id === projectId)) {
    throw new ToolHandlerError('not-found', `Project ${projectId} not found.`);
  }
}

function resolveProjectId(projectIdValue: unknown, fallbackProjectId: string): string {
  const projectId = optionalString(projectIdValue) ?? fallbackProjectId;

  if (!projectId) {
    throw new ToolHandlerError('validation-error', 'Project id is required.');
  }

  return projectId;
}

function requireString(value: unknown, field: string): string {
  const normalized = optionalString(value);

  if (!normalized) {
    throw new ToolHandlerError('validation-error', `${field} is required.`);
  }

  return normalized;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ToolHandlerError('validation-error', `${field} must be an object.`);
}
