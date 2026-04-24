import { describe, expect, it } from 'vitest';

import {
  buildRollingWorkflowItemActivitySummary,
  createWorkflowItemActivitySummary,
  createWorkflowProjectActivitySummary,
} from '@/shared/workflow/activity';
import type { WorkflowItem } from '@/renderer/features/workflow/types';

function createItem(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    activity: createWorkflowItemActivitySummary(),
    artifactFolderName: 'item-1',
    brief: 'Brief',
    createdAt: 1,
    id: 'item-1',
        priority: 'medium',
    primaryAgentId: null,
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: 'ready',
    tasks: [],
    title: 'Item One',
    updatedAt: 1,
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

describe('workflow activity helpers', () => {
  it('builds a rolling summary for archived item activity', () => {
    const summary = buildRollingWorkflowItemActivitySummary('Launch brief', [
      {
        actor: 'Dune',
        createdAt: 1,
        description: 'Work item created.',
        id: 'event-1',
        kind: 'item',
      },
      {
        actor: 'Navigator',
        createdAt: 2,
        description: 'Primary agent set.',
        id: 'event-2',
        kind: 'assignment',
      },
    ]);

    expect(summary).toContain('2 earlier activity events were archived for "Launch brief".');
    expect(summary).toContain('- Dune: Work item created.');
    expect(summary).toContain('- Navigator: Primary agent set.');
  });

  it('reduces isolated item summaries into one project summary', () => {
    const summary = createWorkflowProjectActivitySummary([
      createItem({
        activity: createWorkflowItemActivitySummary({
          archivedEventCount: 3,
          hasOlderEvents: true,
          rollingSummary: 'Item one summary',
          totalEventCount: 5,
        }),
        id: 'item-1',
        title: 'Item One',
        updatedAt: 10,
      }),
      createItem({
        activity: createWorkflowItemActivitySummary({
          archivedEventCount: 2,
          hasOlderEvents: true,
          rollingSummary: 'Item two summary',
          totalEventCount: 4,
        }),
        id: 'item-2',
        title: 'Item Two',
        updatedAt: 20,
      }),
    ]);

    expect(summary).toEqual({
      archivedEntryCount: 5,
      hasOlderEntries: true,
      rollingSummary: expect.stringContaining('Item two summary'),
      totalEntryCount: 9,
    });
    expect(summary.rollingSummary).toContain('### Item Two');
    expect(summary.rollingSummary).toContain('### Item One');
  });
});
