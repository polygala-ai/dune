// Command menu tests.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CommandMenu } from '@/renderer/app/shell/CommandMenu';
import { buildWorkflowSearchIndex } from '@/renderer/features/workflow/model/workflow-search';
import type {
  WorkflowItem,
  WorkflowProject,
} from '@/renderer/features/workflow/types';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

const project: WorkflowProject = {
  color: '#8a5b42',
  createdAt: Date.parse('2026-04-01T09:00:00.000Z'),
  description: 'Search project',
  id: 'project-1',
  name: 'Docs Search',
  rootPath: null,
  updatedAt: Date.parse('2026-04-10T09:00:00.000Z'),
};

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

describe('CommandMenu', () => {
  it('renders agent status labels in the agent list', () => {
    render(
      <CommandMenu
        agents={[
          {
            id: 'agent-1',
            name: 'Navigator',
            preview: 'Reviewing the latest thread.',
            projectId: 'project-1',
            statusLabel: 'Streaming',
            updatedLabel: 'Now',
            workspace: 'AgentLite agent',
          },
        ]}
        isContextPanelOpen={false}
        items={[]}
        onCreateAgent={vi.fn()}
        onCreateItem={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenBoard={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectItem={vi.fn()}
        onSelectProject={vi.fn()}
        onToggleContextPanel={vi.fn()}
        open
        projects={[]}
        searchAgentOptions={[]}
        searchIndex={[]}
      />,
    );

    expect(screen.getByText('Streaming · AgentLite agent')).toBeInTheDocument();
  });

  it('shows work-item search results with snippets and keyboard selection', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const searchIndex = buildWorkflowSearchIndex([
      createItem({
        brief: 'Tighten the desktop launch notes before review.',
        id: 'item-1',
        primaryAgentId: 'agent-1',
        reviewerName: 'Dune Repo Lead',
        status: 'review',
        title: 'Release checklist',
        workProducts: [
          {
            body: 'The current release draft still needs rollback guidance and validation notes.',
            createdAt: Date.parse('2026-04-11T09:00:00.000Z'),
            id: 'product-1',
            title: 'Release draft',
          },
        ],
      }),
    ], [{ id: 'agent-1', name: 'Dune Repo Lead' }], [project]);

    render(
      <CommandMenu
        agents={[]}
        isContextPanelOpen={false}
        items={[]}
        onCreateAgent={vi.fn()}
        onCreateItem={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenBoard={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectItem={onSelectItem}
        onSelectProject={vi.fn()}
        onToggleContextPanel={vi.fn()}
        open
        projects={[project]}
        searchAgentOptions={[{ id: 'agent-1', name: 'Dune Repo Lead' }]}
        searchIndex={searchIndex}
      />,
    );

    await user.type(
      screen.getByPlaceholderText('Jump to a project, work item, agent, or action…'),
      'rollback guidance',
    );

    expect(await screen.findByText('Release checklist')).toBeInTheDocument();
    expect(screen.getAllByText('Dune Repo Lead')).toHaveLength(2);
    expect(screen.getByText(/rollback guidance and validation notes/i)).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(onSelectItem).toHaveBeenCalledWith('item-1');
  });
});
