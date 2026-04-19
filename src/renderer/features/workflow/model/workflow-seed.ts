// Workflow seed data builders.

import { createId, createProjectId } from '@/shared/id';
import type { WorkflowSnapshot } from '@/renderer/features/workflow/types';
import { createArtifactFolderName } from '@/shared/workflow/project-artifacts';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

/** Creates empty workflow snapshot. */
export function createEmptyWorkflowSnapshot(): WorkflowSnapshot {
  return {
    items: [],
    projects: [],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: null,
    selectedProjectView: 'board',
  };
}

/** Creates seed workflow snapshot. */
export function createSeedWorkflowSnapshot(now: number = Date.now()): WorkflowSnapshot {
  const projectId = createProjectId();

  const inboxItemId = createId('item');
  const readyItemId = createId('item');
  const activeItemId = createId('item');
  const reviewItemId = createId('item');
  const acceptanceItemId = createId('item');
  const doneItemId = createId('item');

  const items: WorkflowSnapshot['items'] = [
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Capture new research angles', inboxItemId),
        brief:
          'Capture incoming ideas before deciding whether they need an agent or a heavier execution pass.',
        createdAt: now - 1000 * 60 * 160,
        id: inboxItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: null,
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'inbox',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 150,
            id: createId('task'),
            notes: '',
            status: 'todo',
            title: 'Collect the rough problem statements',
            updatedAt: now - 1000 * 60 * 150,
          },
        ],
        title: 'Capture new research angles',
        updatedAt: now - 1000 * 60 * 145,
        workProducts: [],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 145,
            description: 'Work item created for the project intake lane.',
            id: createId('event'),
            kind: 'item',
          },
        ],
      },
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Draft the launch brief', readyItemId),
        brief:
          'Shape the next brief so an agent can pick it up cleanly once the direction is approved.',
        createdAt: now - 1000 * 60 * 230,
        id: readyItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: null,
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'ready',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 220,
            id: createId('task'),
            notes: '',
            status: 'doing',
            title: 'Draft a one-page outline',
            updatedAt: now - 1000 * 60 * 95,
          },
          {
            createdAt: now - 1000 * 60 * 218,
            id: createId('task'),
            notes: '',
            status: 'todo',
            title: 'Collect open questions',
            updatedAt: now - 1000 * 60 * 218,
          },
        ],
        title: 'Draft the launch brief',
        updatedAt: now - 1000 * 60 * 95,
        workProducts: [],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 95,
            description: 'Brief shaping started for the ready lane.',
            id: createId('event'),
            kind: 'task',
          },
        ],
      },
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Homepage copy rewrite', activeItemId),
        brief:
          'Rewrite the landing story so the positioning and CTA rhythm are easier to understand in one pass.',
        createdAt: now - 1000 * 60 * 360,
        id: activeItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: null,
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'active',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 340,
            id: createId('task'),
            notes: '',
            status: 'done',
            title: 'Audit the existing homepage',
            updatedAt: now - 1000 * 60 * 180,
          },
          {
            createdAt: now - 1000 * 60 * 330,
            id: createId('task'),
            notes: '',
            status: 'doing',
            title: 'Draft the new hero copy',
            updatedAt: now - 1000 * 60 * 44,
          },
          {
            createdAt: now - 1000 * 60 * 325,
            id: createId('task'),
            notes: '',
            status: 'todo',
            title: 'Rewrite social proof',
            updatedAt: now - 1000 * 60 * 325,
          },
        ],
        title: 'Homepage copy rewrite',
        updatedAt: now - 1000 * 60 * 44,
        workProducts: [
          {
            body:
              'The current draft needs a sharper opening sentence before it is ready for assignment to an execution agent.',
            createdAt: now - 1000 * 60 * 52,
            id: createId('work-product'),
            title: 'Draft note',
          },
        ],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 44,
            description: 'Copy draft updated in the active lane.',
            id: createId('event'),
            kind: 'note',
          },
        ],
      },
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Review the proof points', reviewItemId),
        brief:
          'Resolve the unanswered questions and the blocked evidence before the piece can be signed off.',
        createdAt: now - 1000 * 60 * 520,
        id: reviewItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: 'Dune Repo Lead',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'review',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 510,
            id: createId('task'),
            notes: '',
            status: 'review',
            title: 'Review the draft against the research notes',
            updatedAt: now - 1000 * 60 * 170,
          },
          {
            createdAt: now - 1000 * 60 * 505,
            id: createId('task'),
            notes: '',
            status: 'blocked',
            title: 'Confirm the supporting metric',
            updatedAt: now - 1000 * 60 * 100,
          },
        ],
        title: 'Review the proof points',
        updatedAt: now - 1000 * 60 * 100,
        workProducts: [],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 100,
            description: 'A blocked dependency surfaced during review.',
            id: createId('event'),
            kind: 'task',
          },
        ],
      },
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Human sign-off on launch copy', acceptanceItemId),
        brief:
          'This draft passed review and now needs a human decision before it can be marked done.',
        createdAt: now - 1000 * 60 * 610,
        id: acceptanceItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: 'Dune Repo Lead',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'acceptance',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 600,
            id: createId('task'),
            notes: '',
            status: 'done',
            title: 'Finish the final copy pass',
            updatedAt: now - 1000 * 60 * 560,
          },
          {
            createdAt: now - 1000 * 60 * 595,
            id: createId('task'),
            notes: '',
            status: 'review',
            title: 'Get human sign-off on the revised launch copy',
            updatedAt: now - 1000 * 60 * 120,
          },
        ],
        title: 'Human sign-off on launch copy',
        updatedAt: now - 1000 * 60 * 120,
        workProducts: [
          {
            body:
              'The revised launch copy is complete and waiting on a human approval decision before release.',
            createdAt: now - 1000 * 60 * 125,
            id: createId('work-product'),
            title: 'Approved draft',
          },
        ],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 120,
            description: 'Item moved into acceptance for human sign-off.',
            id: createId('event'),
            kind: 'item',
          },
        ],
      },
      {
        activity: createWorkflowItemActivitySummary({
          totalEventCount: 1,
        }),
        artifactFolderName: createArtifactFolderName('Capture the launch position', doneItemId),
        brief:
          'Keep one completed item around so the board shows the end state without feeling empty on first launch.',
        createdAt: now - 1000 * 60 * 700,
        id: doneItemId,
        primaryAgentId: null,
        projectId,
        reviewerName: 'Staff reviewer',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'done',
        tasks: [
          {
            createdAt: now - 1000 * 60 * 680,
            id: createId('task'),
            notes: '',
            status: 'done',
            title: 'Summarize the positioning decision',
            updatedAt: now - 1000 * 60 * 620,
          },
        ],
        title: 'Capture the launch position',
        updatedAt: now - 1000 * 60 * 620,
        workProducts: [
          {
            body:
              'The project page should feel calm and legible first, with deeper execution only when a work item or agent is selected.',
            createdAt: now - 1000 * 60 * 630,
            id: createId('work-product'),
            title: 'Final note',
          },
        ],
        workflowEvents: [
          {
            createdAt: now - 1000 * 60 * 620,
            description: 'Work item marked done.',
            id: createId('event'),
            kind: 'item',
          },
        ],
      },
    ];

  return {
    items,
    projects: [
      {
        color: '#A86D46',
        createdAt: now - 1000 * 60 * 800,
        description: 'Clarify strategy, ship writing, and coordinate agents from one project page.',
        id: projectId,
        name: 'Research Platform',
        rootPath: null,
        updatedAt: now - 1000 * 60 * 44,
      },
    ],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: projectId,
    selectedProjectView: 'board',
  };
}
