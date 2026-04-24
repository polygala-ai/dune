// Search index tests.

import { describe, expect, it } from 'vitest';

import type { Agent } from '@/renderer/features/agents/types';
import { createDefaultWorkItemFilters, filterWorkflowItems, SearchIndex } from '@/renderer/utils/SearchIndex';
import type {
  WorkflowItem,
  WorkflowItemStatus,
} from '@/renderer/features/workflow/types';

const baseTime = new Date('2026-04-20T12:00:00Z').getTime();

const agents = [
  { id: 'agent-1', name: 'Dune Repo Lead' },
  { id: 'agent-2', name: 'Other Agent' },
] as Agent[];

function item(input: Partial<WorkflowItem> & Pick<WorkflowItem, 'id' | 'title'>): WorkflowItem {
  const status: WorkflowItemStatus = input.status ?? 'ready';

  return {
    activity: {
      archivedEventCount: 0,
      hasOlderEvents: false,
      rollingSummary: null,
      totalEventCount: 0,
    },
    artifactFolderName: `${input.id}-artifacts`,
    brief: input.brief ?? '',
    createdAt: input.createdAt ?? baseTime,
    id: input.id,
    primaryAgentId: input.primaryAgentId ?? null,
    projectId: input.projectId ?? 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status,
    tasks: input.tasks ?? [],
    title: input.title,
    updatedAt: input.updatedAt ?? baseTime,
    workProducts: input.workProducts ?? [],
    workflowEvents: input.workflowEvents ?? [],
  };
}

describe('SearchIndex', () => {
  it('searches titles, briefs, and work product bodies with snippets', () => {
    const index = new SearchIndex([
      item({
        brief: 'No relevant prose here.',
        id: 'item-1',
        title: 'Landing page polish',
      }),
      item({
        brief: 'Summarize rollout risks.',
        id: 'item-2',
        title: 'Release report',
        workProducts: [
          {
            body: 'The audit log migration requires a manual checkpoint before release.',
            createdAt: baseTime,
            id: 'product-1',
            title: 'Review notes',
          },
        ],
      }),
    ], agents);

    const results = index.search('manual checkpoint');

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('item-2');
    expect(results[0]?.snippet).toContain('manual checkpoint');
  });

  it('combines text search with status, assignee, reviewer, and date filters', () => {
    const index = new SearchIndex([
      item({
        brief: 'Review the command palette implementation.',
        createdAt: new Date('2026-04-19T12:00:00Z').getTime(),
        id: 'item-1',
        primaryAgentId: 'agent-1',
        status: 'review',
        title: 'Search and filter',
        tasks: [
          {
            createdAt: baseTime,
            id: 'task-1',
            notes: '',
            status: 'review',
            title: 'Reviewer pass',
            updatedAt: baseTime,
          },
        ],
      }),
      item({
        brief: 'Review the unrelated dashboard.',
        createdAt: new Date('2026-04-23T12:00:00Z').getTime(),
        id: 'item-2',
        primaryAgentId: 'agent-2',
        status: 'review',
        title: 'Dashboard cleanup',
      }),
    ], agents);

    const results = index.search('review', {
      ...createDefaultWorkItemFilters(),
      agentIds: ['agent-1'],
      dateFrom: '2026-04-18',
      dateTo: '2026-04-20',
      reviewer: 'has',
      statuses: ['review'],
    });

    expect(results.map((result) => result.id)).toEqual(['item-1']);
  });

  it('returns filtered items when no query is entered', () => {
    const first = item({
      id: 'item-1',
      primaryAgentId: 'agent-1',
      status: 'active',
      title: 'Active item',
    });
    const hidden = item({
      id: 'item-2',
      primaryAgentId: 'agent-2',
      status: 'done',
      title: 'Done item',
    });
    const filters = {
      ...createDefaultWorkItemFilters(),
      agentIds: ['agent-1'],
      statuses: ['active' as const],
    };
    const index = new SearchIndex([first, hidden], agents);

    expect(filterWorkflowItems([first, hidden], filters).map((result) => result.id)).toEqual(['item-1']);
    expect(index.search('', filters).map((result) => result.id)).toEqual(['item-1']);
  });
});
