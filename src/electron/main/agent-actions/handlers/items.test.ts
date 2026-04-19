import { describe, expect, it } from 'vitest';

import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

import { itemTools } from './items';
import type { WorkflowSnapshot } from './snapshot';
import type { ToolServices } from './types';

function createSnapshot(): WorkflowSnapshot {
  return {
    items: [
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-1',
        brief: 'Blocked item',
        createdAt: 1,
        id: 'item-1',
        primaryAgentId: 'agent-1',
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'ready',
        tasks: [],
        title: 'Blocked item',
        updatedAt: 1,
        workProducts: [],
        workflowEvents: [],
      },
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-2',
        brief: 'Dependency item',
        createdAt: 2,
        id: 'item-2',
        primaryAgentId: null,
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 1,
        status: 'active',
        tasks: [],
        title: 'Dependency item',
        updatedAt: 2,
        workProducts: [],
        workflowEvents: [],
      },
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-3',
        brief: 'Third item',
        createdAt: 3,
        dependsOn: ['item-1'],
        id: 'item-3',
        primaryAgentId: null,
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 2,
        status: 'inbox',
        tasks: [],
        title: 'Third item',
        updatedAt: 3,
        workProducts: [],
        workflowEvents: [],
      },
    ],
    projects: [
      {
        color: '#000000',
        createdAt: 1,
        description: 'Project',
        id: 'project-1',
        name: 'Project',
        rootPath: null,
        updatedAt: 1,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: 'project-1',
    selectedProjectView: 'board',
  };
}

function createServices(snapshot: WorkflowSnapshot): ToolServices & { getSnapshot: () => WorkflowSnapshot } {
  let currentSnapshot = structuredClone(snapshot);

  return {
    agentContext: {
      agentId: 'agent-1',
      agentName: 'Navigator',
      ipcContainerDir: '/workspace/extra/dune',
      ipcHostDir: '/tmp/dune',
      projectId: 'project-1',
    },
    getRuntimeController: () => ({
      getSnapshot: () => ({
        agents: [
          {
            definition: { archetype: 'worker', responsibilities: [] },
            id: 'agent-1',
            name: 'Navigator',
            projectId: 'project-1',
            status: 'ready',
            updatedAt: 1,
          },
        ],
      }),
    }) as never,
    getSnapshot: () => currentSnapshot,
    onWorkflowChanged: () => undefined,
    workflowStore: {
      delete: async () => undefined,
      get: async <T,>(key: string) => (key === 'snapshot' ? structuredClone(currentSnapshot) as T : null),
      keys: async () => ['snapshot'],
      set: async <T,>(key: string, value: T) => {
        if (key === 'snapshot') {
          currentSnapshot = structuredClone(value as WorkflowSnapshot);
        }
      },
    },
  };
}

describe('item dependency handlers', () => {
  it('adds and removes dependencies on work items', async () => {
    const services = createServices(createSnapshot());
    const addDependency = itemTools.find((tool) => tool.definition.name === 'workflow.items.add_dependency')!.handler;
    const removeDependency = itemTools.find((tool) => tool.definition.name === 'workflow.items.remove_dependency')!.handler;

    await addDependency(services, {
      dependsOnId: 'item-2',
      itemId: 'item-1',
    });

    let item = services.getSnapshot().items.find((candidate) => candidate.id === 'item-1');
    expect(item?.dependsOn).toEqual(['item-2']);
    expect(item?.workflowEvents[0]?.description).toBe('Added dependency on "Dependency item".');

    await removeDependency(services, {
      dependsOnId: 'item-2',
      itemId: 'item-1',
    });

    item = services.getSnapshot().items.find((candidate) => candidate.id === 'item-1');
    expect(item?.dependsOn).toBeUndefined();
    expect(item?.workflowEvents[0]?.description).toBe('Removed dependency on "Dependency item".');
  });

  it('rejects circular dependency updates', async () => {
    const services = createServices(createSnapshot());
    const addDependency = itemTools.find((tool) => tool.definition.name === 'workflow.items.add_dependency')!.handler;

    await expect(addDependency(services, {
      dependsOnId: 'item-3',
      itemId: 'item-1',
    })).rejects.toThrow('Cannot create a circular dependency.');
  });

  it('rejects moves to active while dependencies are unresolved', async () => {
    const services = createServices(createSnapshot());
    const addDependency = itemTools.find((tool) => tool.definition.name === 'workflow.items.add_dependency')!.handler;
    const moveItem = itemTools.find((tool) => tool.definition.name === 'workflow.items.move')!.handler;

    await addDependency(services, {
      dependsOnId: 'item-2',
      itemId: 'item-1',
    });

    await expect(moveItem(services, {
      itemId: 'item-1',
      status: 'active',
    })).rejects.toThrow(
      'Cannot move item to active: it has unresolved dependencies. All dependencies must reach done or acceptance first.',
    );
  });
});
