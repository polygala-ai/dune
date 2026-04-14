import { createProjectId } from '@/shared/id';
import { prepareProjectRootPath } from '@/electron/main/workflow/project-artifacts';

import { optionalString, requireString, resolveProjectId } from './helpers';
import { presentProject } from './presenters';
import {
  readWorkflowSnapshot,
  writeWorkflowSnapshot,
  type WorkflowProject,
} from './snapshot';
import { emptyObjectSchema, objectSchema, optionalStringSchema, stringSchema } from './schemas';
import { ToolHandlerError, type RegisteredTool } from './types';

const defaultProjectColors = ['#A86D46', '#7A8B5D', '#4F7A78', '#9D6A71', '#6C69A6'] as const;

export const projectTools: RegisteredTool[] = [
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
];
