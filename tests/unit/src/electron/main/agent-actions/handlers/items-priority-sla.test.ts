import { describe, expect, it } from 'vitest';

import { itemTools } from '@/electron/main/agent-actions/handlers/items';
import type { WorkflowSnapshot } from '@/electron/main/agent-actions/handlers/snapshot';
import type { ToolServices } from '@/electron/main/agent-actions/handlers/types';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

function createSnapshot(): WorkflowSnapshot {
  return {
    items: [
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-1',
        brief: 'Initial brief',
        createdAt: 1,
        id: 'item-1',
        priority: 'medium',
        primaryAgentId: null,
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'active',
        tasks: [],
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
      agentName: 'Planner',
      ipcContainerDir: '/workspace/extra/dune',
      ipcHostDir: '/tmp/dune',
      projectId: 'project-1',
    },
    getRuntimeController: () => ({
      getSnapshot: () => ({ agents: [] }),
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

describe('workflow item priority and SLA actions', () => {
  it('persists priority and SLA updates with workflow events', async () => {
    const services = createServices(createSnapshot());
    const updateHandler = itemTools.find((tool) => tool.definition.name === 'workflow.items.update')!.handler;
    const listHandler = itemTools.find((tool) => tool.definition.name === 'workflow.items.list')!.handler;
    const deadline = Date.UTC(2026, 0, 1);

    await updateHandler(services, {
      itemId: 'item-1',
      priority: 'critical',
      slaDeadlineMs: deadline,
    });

    const item = services.getSnapshot().items[0]!;
    expect(item.priority).toBe('critical');
    expect(item.slaDeadlineMs).toBe(deadline);
    expect(item.workflowEvents.map((event) => event.kind)).toEqual([
      'item.sla_set',
      'item.priority_changed',
    ]);

    const result = await listHandler(services, {}) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]).toEqual(expect.objectContaining({
      priority: 'critical',
      slaDeadlineMs: deadline,
    }));
  });

  it('clears SLA deadlines and previous escalation timestamps', async () => {
    const services = createServices(createSnapshot());
    services.getSnapshot().items[0]!.slaDeadlineMs = 100;
    services.getSnapshot().items[0]!.slaWarnedAt = 50;
    services.getSnapshot().items[0]!.slaBreachedAt = 100;
    const updateHandler = itemTools.find((tool) => tool.definition.name === 'workflow.items.update')!.handler;

    await updateHandler(services, {
      itemId: 'item-1',
      slaDeadlineMs: null,
    });

    const item = services.getSnapshot().items[0]!;
    expect(item.slaDeadlineMs).toBeUndefined();
    expect(item.slaWarnedAt).toBeUndefined();
    expect(item.slaBreachedAt).toBeUndefined();
    expect(item.workflowEvents[0]?.kind).toBe('item.sla_cleared');
  });
});
