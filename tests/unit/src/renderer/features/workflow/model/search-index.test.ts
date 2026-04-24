// Work item search index tests.

import { describe, expect, it } from 'vitest';

import { createSearchIndex } from '@/renderer/features/workflow/model/search-index';
import type { Agent } from '@/renderer/features/agents/types';
import type {
  WorkflowItem,
  WorkflowProject,
} from '@/renderer/features/workflow/types';

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
    updatedAt: 1,
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

const agents = [
  {
    id: 'agent-1',
    name: 'Dune Repo Lead',
  },
] as Agent[];

const projects: WorkflowProject[] = [
  {
    color: '#000000',
    createdAt: 1,
    description: '',
    id: 'project-1',
    name: 'Desktop App',
    rootPath: null,
    updatedAt: 1,
  },
];

describe('createSearchIndex', () => {
  it('matches work product content and returns the work item metadata', () => {
    const index = createSearchIndex(
      [
        createItem({
          brief: 'Improve command workflows.',
          primaryAgentId: 'agent-1',
          status: 'review',
          title: 'Command palette polish',
          workProducts: [
            {
              body: 'The generated artifact documents keyboard navigation behavior.',
              createdAt: 1,
              id: 'product-1',
              title: 'Implementation notes',
            },
          ],
        }),
      ],
      agents,
      projects,
    );

    const results = index.search('keyboard navigation');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      assigneeName: 'Dune Repo Lead',
      itemId: 'item-1',
      projectName: 'Desktop App',
      statusLabel: 'Review',
      title: 'Command palette polish',
    });
    expect(results[0]?.snippet).toContain('keyboard navigation');
  });
});
