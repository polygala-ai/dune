import { describe, expect, it } from 'vitest';

import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

import { itemTools } from '@/electron/main/agent-actions/handlers/items';
import type {
  WorkflowItemStatus,
  WorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import { taskTools } from '@/electron/main/agent-actions/handlers/tasks';
import type { ToolServices } from '@/electron/main/agent-actions/handlers/types';
import { workProductTools } from '@/electron/main/agent-actions/handlers/work-products';

function createSnapshot(status: WorkflowItemStatus = 'active'): WorkflowSnapshot {
  return {
    items: [
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-1',
        brief: 'Initial brief',
        createdAt: 1,
        id: 'item-1',
        primaryAgentId: 'agent-1',
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 0,
        status,
        tasks: [
          {
            createdAt: 1,
            id: 'task-1',
            notes: '',
            status: 'todo',
            title: 'Initial task',
            updatedAt: 1,
          },
        ],
        title: 'Item',
        updatedAt: 1,
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
      agentName: 'Reviewer',
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
            name: 'Reviewer',
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
      deleteActivityArchive: async () => undefined,
      deleteActivityArchivesExcept: async () => undefined,
      readActivityArchive: async () => ({ events: [], lastCompactedAt: null, rollingSummary: null }),
      readSnapshot: async () => structuredClone(currentSnapshot),
      writeActivityArchive: async () => undefined,
      writeSnapshot: async (value: WorkflowSnapshot) => {
        currentSnapshot = structuredClone(value);
      },
    },
  };
}

describe('mutation notes', () => {
  it('records notes for item updates and moves', async () => {
    const services = createServices(createSnapshot('inbox'));
    const updateHandler = itemTools.find((tool) => tool.definition.name === 'workflow.items.update')!.handler;
    const moveHandler = itemTools.find((tool) => tool.definition.name === 'workflow.items.move')!.handler;

    await updateHandler(services, {
      itemId: 'item-1',
      note: 'Clarified the brief before reassigning.',
      title: 'Updated item',
    });

    let item = services.getSnapshot().items[0]!;
    expect(item.workflowEvents[0]?.description).toBe('Clarified the brief before reassigning.');
    expect(item.workflowEvents[1]?.description).toBe('Work item details were updated.');

    item.status = 'review';
    item.primaryAgentId = 'agent-1';
    await moveHandler(services, {
      itemId: 'item-1',
      note: 'Sending this back for another implementation pass.',
      status: 'active',
    });

    item = services.getSnapshot().items[0]!;
    expect(item.workflowEvents[0]?.description).toBe('Sending this back for another implementation pass.');
    expect(item.workflowEvents[1]?.description).toBe('Work item moved to active.');
  });

  it('records notes for task updates', async () => {
    const services = createServices(createSnapshot('active'));
    const taskUpdateHandler = taskTools.find((tool) => tool.definition.name === 'workflow.tasks.update')!.handler;

    await taskUpdateHandler(services, {
      itemId: 'item-1',
      note: 'Blocked on the API response schema.',
      status: 'blocked',
      taskId: 'task-1',
    });

    const item = services.getSnapshot().items[0]!;
    expect(item.workflowEvents[0]?.description).toBe('Blocked on the API response schema.');
    expect(item.workflowEvents[1]?.description).toBe('Checklist updated.');
  });

  it('records notes for work product additions', async () => {
    const services = createServices(createSnapshot('active'));
    const workProductAddHandler = workProductTools.find((tool) => tool.definition.name === 'workflow.work_products.add')!.handler;

    await workProductAddHandler(services, {
      body: 'Draft body',
      itemId: 'item-1',
      note: 'Adding the first draft for reviewer context.',
      title: 'Draft',
    });

    const item = services.getSnapshot().items[0]!;
    expect(item.workflowEvents[0]?.description).toBe('Adding the first draft for reviewer context.');
    expect(item.workflowEvents[1]?.description).toBe('Added output "Draft".');
  });
});
