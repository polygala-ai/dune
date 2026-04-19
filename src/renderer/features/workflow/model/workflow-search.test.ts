// Workflow work-item search tests.

import { describe, expect, it } from 'vitest';

import {
  buildWorkflowSearchIndex,
  defaultWorkflowSearchFilters,
  hasActiveWorkflowSearchFilters,
  searchWorkflowIndex,
} from '@/renderer/features/workflow/model/workflow-search';
import type {
  WorkflowItem,
  WorkflowProject,
} from '@/renderer/features/workflow/types';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

const project: WorkflowProject = {
  color: '#8a5b42',
  createdAt: Date.parse('2026-04-01T09:00:00.000Z'),
  description: 'Local search project',
  id: 'project-1',
  name: 'Docs Search',
  rootPath: null,
  updatedAt: Date.parse('2026-04-10T09:00:00.000Z'),
};

const agents = [
  {
    id: 'agent-1',
    name: 'Dune Repo Lead',
  },
];

function createItem(
  input: Partial<WorkflowItem> & Pick<WorkflowItem, 'id' | 'status' | 'title'>,
): WorkflowItem {
  const {
    id,
    status,
    title,
    ...rest
  } = input;

  return {
    activity: createWorkflowItemActivitySummary(),
    artifactFolderName: `${id}-folder`,
    brief: '',
    createdAt: Date.parse('2026-04-01T09:00:00.000Z'),
    id,
    primaryAgentId: null,
    projectId: project.id,
    reviewerName: null,
    scheduledTaskId: null,
    sortOrder: 0,
    status,
    tasks: [],
    title,
    updatedAt: Date.parse('2026-04-10T09:00:00.000Z'),
    workProducts: [],
    workflowEvents: [],
    ...rest,
  };
}

describe('workflow-search', () => {
  it('indexes titles, briefs, and work product bodies with snippets', () => {
    const index = buildWorkflowSearchIndex([
      createItem({
        brief: 'Document the release flow for the desktop shell.',
        id: 'item-1',
        status: 'review',
        title: 'Release checklist',
        workProducts: [
          {
            body: 'The current release draft needs stronger rollback guidance before launch.',
            createdAt: Date.parse('2026-04-11T09:00:00.000Z'),
            id: 'product-1',
            title: 'Release draft',
          },
        ],
      }),
    ], agents, [project]);

    const [titleResult] = searchWorkflowIndex(index, {
      filters: defaultWorkflowSearchFilters,
      query: 'checklist',
    });
    const [briefResult] = searchWorkflowIndex(index, {
      filters: defaultWorkflowSearchFilters,
      query: 'desktop shell',
    });
    const [productResult] = searchWorkflowIndex(index, {
      filters: defaultWorkflowSearchFilters,
      query: 'rollback guidance',
    });

    expect(titleResult?.title).toBe('Release checklist');
    expect(briefResult?.snippetLabel).toBe('Brief');
    expect(briefResult?.snippet).toMatch(/desktop shell/i);
    expect(productResult?.snippetLabel).toBe('Work product: Release draft');
    expect(productResult?.snippet).toMatch(/rollback guidance/i);
  });

  it('combines status, assignee, date range, and reviewer filters', () => {
    const index = buildWorkflowSearchIndex([
      createItem({
        brief: 'Needs final review.',
        id: 'item-1',
        primaryAgentId: 'agent-1',
        reviewerName: 'Dune Repo Lead',
        status: 'review',
        title: 'Docs audit',
        updatedAt: Date.parse('2026-04-16T09:00:00.000Z'),
      }),
      createItem({
        brief: 'Still active.',
        id: 'item-2',
        primaryAgentId: 'agent-1',
        reviewerName: null,
        status: 'active',
        title: 'Docs polish',
        updatedAt: Date.parse('2026-04-16T09:00:00.000Z'),
      }),
      createItem({
        brief: 'Old review item.',
        id: 'item-3',
        primaryAgentId: 'agent-1',
        reviewerName: 'Dune Repo Lead',
        status: 'review',
        title: 'Archive cleanup',
        updatedAt: Date.parse('2026-03-10T09:00:00.000Z'),
      }),
    ], agents, [project]);

    const results = searchWorkflowIndex(index, {
      filters: {
        assignedAgentId: 'agent-1',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
        reviewer: 'has',
        status: 'review',
      },
      query: '',
    });

    expect(results.map((result) => result.id)).toEqual(['item-1']);
  });

  it('tracks when reviewer or date filters become active', () => {
    expect(hasActiveWorkflowSearchFilters(defaultWorkflowSearchFilters)).toBe(false);
    expect(hasActiveWorkflowSearchFilters({
      ...defaultWorkflowSearchFilters,
      reviewer: 'none',
    })).toBe(true);
    expect(hasActiveWorkflowSearchFilters({
      ...defaultWorkflowSearchFilters,
      dateFrom: '2026-04-10',
    })).toBe(true);
  });
});
