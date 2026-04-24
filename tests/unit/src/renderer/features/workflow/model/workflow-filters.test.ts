// Workflow filter tests.

import { describe, expect, it } from 'vitest';

import {
  filterWorkflowItems,
  type WorkflowItemFilters,
} from '@/renderer/features/workflow/model/workflow-filters';
import type { WorkflowItem } from '@/renderer/features/workflow/types';

function createItem(overrides: Partial<WorkflowItem>): WorkflowItem {
  return {
    activity: {
      archivedEventCount: 0,
      hasOlderEvents: false,
      rollingSummary: null,
      totalEventCount: 0,
    },
    artifactFolderName: 'item-one',
    brief: '',
    createdAt: 1,
    id: 'item-1',
    primaryAgentId: null,
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: 'inbox',
    tasks: [],
    title: 'Untitled',
    updatedAt: new Date('2026-01-15T12:00:00').getTime(),
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

describe('filterWorkflowItems', () => {
  it('combines status, agent, date, and reviewer filters', () => {
    const matchingItem = createItem({
      id: 'item-match',
      primaryAgentId: 'agent-1',
      status: 'review',
      workflowEvents: [
        {
          createdAt: 1,
          description: 'Looks ready.',
          id: 'event-1',
          kind: 'feedback',
        },
      ],
    });
    const wrongAgentItem = createItem({
      id: 'item-wrong-agent',
      primaryAgentId: 'agent-2',
      status: 'review',
      workflowEvents: [
        {
          createdAt: 1,
          description: 'Looks ready.',
          id: 'event-2',
          kind: 'feedback',
        },
      ],
    });
    const filters: WorkflowItemFilters = {
      agentId: 'agent-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      reviewer: 'has',
      status: 'review',
    };

    expect(filterWorkflowItems([matchingItem, wrongAgentItem], filters).map((item) => item.id))
      .toEqual(['item-match']);
  });
});
