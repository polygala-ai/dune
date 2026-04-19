// Workflow item inspector tests.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowItemInspector } from '@/renderer/features/workflow/components/WorkflowItemInspector';
import type {
  WorkflowItem,
  WorkflowProject,
} from '@/renderer/features/workflow/types';
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';

const project: WorkflowProject = {
  color: '#2563eb',
  createdAt: 1,
  description: 'Project description',
  id: 'project-1',
  name: 'Project Atlas',
  rootPath: '/tmp/project-root',
  updatedAt: 1,
};

const item: WorkflowItem & {
  primaryAgentName: string | null;
  workflowEvents: Array<{ createdAt: number; createdAtLabel: string; description: string; id: string; kind: string }>;
} = {
  activity: createWorkflowItemActivitySummary(),
  artifactFolderName: 'homepage-copy-abcd1234',
  brief: 'Rewrite the homepage narrative.',
  createdAt: 1,
  id: 'item-1',
  primaryAgentId: null,
  primaryAgentName: null,
  projectId: project.id,
  scheduledTaskId: null,
  sortOrder: 0,
  status: 'active',
  tasks: [],
  title: 'Homepage copy',
  updatedAt: 1,
  workProducts: [],
  workflowEvents: [],
};

describe('WorkflowItemInspector', () => {
  it('shows artifact folder entries instead of the old outputs editor', async () => {
    const user = userEvent.setup();
    const listProjectArtifactEntries = vi.fn(async () => ([
      {
        kind: 'file' as const,
        modifiedAt: Date.parse('2026-04-11T09:00:00.000Z'),
        name: 'brief.md',
        path: '/tmp/project-root/homepage-copy-abcd1234/brief.md',
        relativePath: 'brief.md',
        size: 1024,
      },
      {
        kind: 'directory' as const,
        modifiedAt: Date.parse('2026-04-11T08:00:00.000Z'),
        name: 'drafts',
        path: '/tmp/project-root/homepage-copy-abcd1234/drafts',
        relativePath: 'drafts',
        size: null,
      },
    ]));
    const openPath = vi.fn(() => Promise.resolve(undefined));

    window.duneDesktop = {
      ...(window.duneDesktop ?? { platform: 'darwin' as const }),
      listProjectArtifactEntries,
      openPath,
      platform: window.duneDesktop?.platform ?? 'darwin',
    };

    render(
      <WorkflowItemInspector
        item={item}
        onAddTask={vi.fn()}
        onAssignPrimaryAgent={vi.fn()}
        onCreateAgent={vi.fn()}
        onOpenAgent={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItemStatus={vi.fn()}
        onUpdateTask={vi.fn()}
        project={project}
        projectAgents={[]}
      />,
    );

    expect(await screen.findByText('brief.md')).toBeInTheDocument();
    expect(screen.getByText('drafts')).toBeInTheDocument();
    expect(screen.queryByText('Add Output')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Output title')).not.toBeInTheDocument();

    const rows = screen.getAllByTestId('workflow-artifact-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('brief.md');
    expect(rows[1]).toHaveTextContent('drafts');

    await user.click(screen.getByRole('button', { name: /open folder/i }));
    await user.click(screen.getByRole('button', { name: /open artifact brief\.md/i }));

    expect(listProjectArtifactEntries).toHaveBeenCalledWith('/tmp/project-root', 'homepage-copy-abcd1234');
    expect(openPath).toHaveBeenNthCalledWith(1, '/tmp/project-root/homepage-copy-abcd1234');
    expect(openPath).toHaveBeenNthCalledWith(2, '/tmp/project-root/homepage-copy-abcd1234/brief.md');
  });

  it('shows a missing-folder message when the project root is not configured', async () => {
    const listProjectArtifactEntries = vi.fn(async () => []);

    window.duneDesktop = {
      ...(window.duneDesktop ?? { platform: 'darwin' as const }),
      listProjectArtifactEntries,
      platform: window.duneDesktop?.platform ?? 'darwin',
    };

    render(
      <WorkflowItemInspector
        item={item}
        onAddTask={vi.fn()}
        onAssignPrimaryAgent={vi.fn()}
        onCreateAgent={vi.fn()}
        onOpenAgent={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItemStatus={vi.fn()}
        onUpdateTask={vi.fn()}
        project={{ ...project, rootPath: null }}
        projectAgents={[]}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'This project does not have a project folder yet, so this work item has no on-disk artifact folder.',
        ),
      ).toBeInTheDocument();
    });
    expect(listProjectArtifactEntries).not.toHaveBeenCalled();
  });
});
