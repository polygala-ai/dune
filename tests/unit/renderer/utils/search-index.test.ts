import { describe, expect, it } from 'vitest';

import type { Agent } from '@/renderer/features/agents/types';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';
import {
  filterWorkflowItems,
  SearchIndex,
  unassignedAgentFilterId,
  type WorkItemFilters,
} from '@/renderer/utils/SearchIndex';

const baseFilters: WorkItemFilters = {
  agentIds: [],
  dateFrom: '',
  dateTo: '',
  reviewer: 'all',
  statuses: [],
};

const agents = [
  { id: 'agent-dune', name: 'Dune Repo Lead' },
  { id: 'agent-review', name: 'Code Reviewer' },
] as Agent[];

function createItem(input: {
  brief?: string;
  createdAt?: number;
  id: string;
  primaryAgentId?: string | null;
  status?: WorkflowItemStatus;
  taskStatus?: WorkflowTaskStatus;
  title: string;
  workProductBody?: string;
}): WorkflowItem {
  const createdAt = input.createdAt ?? Date.parse('2026-04-20T12:00:00Z');

  return {
    activity: {
      archivedEventCount: 0,
      hasOlderEvents: false,
      rollingSummary: null,
      totalEventCount: 0,
    },
    artifactFolderName: input.id,
    brief: input.brief ?? '',
    createdAt,
    id: input.id,
    primaryAgentId: input.primaryAgentId ?? null,
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: input.status ?? 'inbox',
    tasks: input.taskStatus
      ? [{
          createdAt,
          id: `${input.id}-task`,
          notes: '',
          status: input.taskStatus,
          title: 'Review implementation',
          updatedAt: createdAt,
        }]
      : [],
    title: input.title,
    updatedAt: createdAt,
    workProducts: input.workProductBody
      ? [{
          body: input.workProductBody,
          createdAt,
          id: `${input.id}-work-product`,
          title: 'Implementation notes',
        }]
      : [],
    workflowEvents: [],
  };
}

describe('SearchIndex', () => {
  it('searches titles, briefs, and work product content with result metadata', () => {
    const items = [
      createItem({
        id: 'item-1',
        primaryAgentId: 'agent-dune',
        status: 'active',
        title: 'Ship notifications',
        workProductBody: 'The webhook transport handles retry backoff.',
      }),
      createItem({
        brief: 'Improve project setup',
        id: 'item-2',
        title: 'Project templates',
      }),
    ];

    const results = new SearchIndex(items, agents).search('retry backoff', baseFilters);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      assignee: 'Dune Repo Lead',
      id: 'item-1',
      status: 'active',
      statusLabel: 'Active',
      title: 'Ship notifications',
    });
    expect(results[0]?.snippet).toContain('retry backoff');
  });

  it('combines status, agent, date, and reviewer filters', () => {
    const items = [
      createItem({
        createdAt: Date.parse('2026-04-19T10:00:00Z'),
        id: 'matching',
        primaryAgentId: 'agent-dune',
        status: 'review',
        title: 'Search filters',
        workProductBody: 'Palette search implementation details.',
      }),
      createItem({
        createdAt: Date.parse('2026-04-19T10:00:00Z'),
        id: 'wrong-agent',
        primaryAgentId: 'agent-review',
        status: 'review',
        title: 'Search filters',
        workProductBody: 'Palette search implementation details.',
      }),
      createItem({
        createdAt: Date.parse('2026-04-22T10:00:00Z'),
        id: 'wrong-date',
        primaryAgentId: 'agent-dune',
        status: 'review',
        title: 'Search filters',
        workProductBody: 'Palette search implementation details.',
      }),
      createItem({
        createdAt: Date.parse('2026-04-19T10:00:00Z'),
        id: 'wrong-status',
        primaryAgentId: 'agent-dune',
        status: 'active',
        title: 'Search filters',
        workProductBody: 'Palette search implementation details.',
      }),
    ];

    const results = new SearchIndex(items, agents).search('palette', {
      ...baseFilters,
      agentIds: ['agent-dune'],
      dateFrom: '2026-04-18',
      dateTo: '2026-04-20',
      reviewer: 'has',
      statuses: ['review'],
    });

    expect(results.map((result) => result.id)).toEqual(['matching']);
  });

  it('filters unassigned items and items without reviewer signal', () => {
    const items = [
      createItem({
        id: 'unassigned-ready',
        status: 'ready',
        title: 'Ready without reviewer',
      }),
      createItem({
        id: 'assigned-ready',
        primaryAgentId: 'agent-dune',
        status: 'ready',
        title: 'Assigned without reviewer',
      }),
      createItem({
        id: 'unassigned-task-review',
        status: 'active',
        taskStatus: 'review',
        title: 'Task-level review',
      }),
    ];

    const results = filterWorkflowItems(items, {
      ...baseFilters,
      agentIds: [unassignedAgentFilterId],
      reviewer: 'none',
    });

    expect(results.map((item) => item.id)).toEqual(['unassigned-ready']);
  });
});
