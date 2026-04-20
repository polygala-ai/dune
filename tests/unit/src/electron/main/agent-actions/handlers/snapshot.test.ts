import { describe, expect, it } from 'vitest';

import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

import {
  createWorkflowEvent,
  recordWorkflowItemEvents,
  type WorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';

function createSnapshot(): WorkflowSnapshot {
  return {
    items: [
      {
        activity: createWorkflowItemActivitySummary({ totalEventCount: 0 }),
        artifactFolderName: 'item-1',
        brief: 'Brief',
        createdAt: 1,
        id: 'item-1',
        primaryAgentId: 'agent-1',
        projectId: 'project-1',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'active',
        tasks: [],
        title: 'Item',
        updatedAt: 5,
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
        updatedAt: 3,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: 'project-1',
    selectedProjectView: 'board',
  };
}

describe('recordWorkflowItemEvents', () => {
  it('prepends events and updates item and project timestamps', () => {
    const snapshot = createSnapshot();
    const item = snapshot.items[0]!;
    const event = createWorkflowEvent(
      'assignment',
      'Dune scheduled the assignment task for the assigned agent.',
      10,
      'Dune',
    );

    recordWorkflowItemEvents(snapshot, item, [event], 10);

    expect(item.workflowEvents[0]).toMatchObject({
      actor: 'Dune',
      description: 'Dune scheduled the assignment task for the assigned agent.',
      kind: 'assignment',
    });
    expect(item.updatedAt).toBe(10);
    expect(snapshot.projects[0]?.updatedAt).toBe(10);
  });
});
