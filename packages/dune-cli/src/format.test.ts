// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { renderAgentsTable, renderItemDetails, renderItemsTable } from './format';

describe('CLI formatting', () => {
  it('renders workflow items as a table', () => {
    const output = renderItemsTable([
      {
        activity: {
          archivedEventCount: 0,
          hasOlderEvents: false,
          rollingSummary: null,
          totalEventCount: 1,
        },
        artifactFolderName: 'build-cli',
        artifactPath: null,
        brief: 'Ship the terminal workflow surface.',
        createdAt: 1,
        id: 'item-1',
        primaryAgentId: 'agent-1',
        primaryAgentName: 'Navigator',
        projectId: 'project-1',
        projectName: 'Alpha',
        scheduledTaskId: null,
        sortOrder: 0,
        status: 'active',
        tasks: [],
        title: 'Build CLI',
        updatedAt: 1,
        workProducts: [],
        workflowEvents: [],
      },
    ]);

    expect(output).toContain('ID');
    expect(output).toContain('Navigator');
    expect(output).toContain('Build CLI');
  });

  it('renders agents and item details in a readable form', () => {
    const agentTable = renderAgentsTable([
      {
        assignments: [
          {
            id: 'item-1',
            projectId: 'project-1',
            projectName: 'Alpha',
            status: 'active',
            title: 'Build CLI',
          },
        ],
        currentAssignment: {
          id: 'item-1',
          projectId: 'project-1',
          projectName: 'Alpha',
          status: 'active',
          title: 'Build CLI',
        },
        definition: {
          archetype: 'custom',
          responsibilities: [],
        },
        id: 'agent-1',
        name: 'Navigator',
        projectId: 'project-1',
        projectName: 'Alpha',
        status: 'ready',
        updatedAt: 1,
      },
    ]);
    expect(agentTable).toContain('Assignment');
    expect(agentTable).toContain('Navigator');

    const itemDetails = renderItemDetails({
      activity: {
        archivedEventCount: 0,
        hasOlderEvents: false,
        rollingSummary: null,
        totalEventCount: 1,
      },
      artifactFolderName: 'build-cli',
      artifactPath: '/tmp/build-cli',
      brief: 'Ship the terminal workflow surface.',
      createdAt: 1,
      events: [
        {
          actor: 'Dune CLI',
          createdAt: 1,
          description: 'Created the item.',
          id: 'event-1',
          kind: 'item',
        },
      ],
      id: 'item-1',
      primaryAgent: null,
      primaryAgentId: 'agent-1',
      primaryAgentName: 'Navigator',
      project: {
        id: 'project-1',
        name: 'Alpha',
      },
      projectId: 'project-1',
      projectName: 'Alpha',
      scheduledTaskId: null,
      sortOrder: 0,
      status: 'active',
      tasks: [
        {
          createdAt: 1,
          id: 'task-1',
          notes: '',
          status: 'todo',
          title: 'Plan the work',
          updatedAt: 1,
        },
      ],
      title: 'Build CLI',
      updatedAt: 1,
      workProducts: [],
      workflowEvents: [],
    });

    expect(itemDetails).toContain('Project: Alpha (project-1)');
    expect(itemDetails).toContain('[To do] Plan the work');
    expect(itemDetails).toContain('Dune CLI');
  });
});
