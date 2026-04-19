// Agent timeline tests.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import { AgentTimeline } from '@/renderer/features/agents/components/AgentTimeline';
import type { PresentedAgent } from '@/renderer/features/agents/types';
import type { WorkflowItem } from '@/renderer/features/workflow/types';

/** Creates an agent fixture. */
function createAgent(overrides: Partial<PresentedAgent> = {}): PresentedAgent {
  return {
    activityEvents: [],
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    codingEngineEvents: [],
    contextCards: [],
    definition: { archetype: 'custom', responsibilities: [] },
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: '',
    preview: 'Ready',
    projectId: 'project-1',
    status: 'ready',
    statusLabel: 'Ready',
    telegram: null,
    transcript: {
      archivedMessageCount: 0,
      hasOlderMessages: false,
      rollingSummary: null,
      totalMessageCount: 0,
    },
    updatedAt: Date.now(),
    updatedLabel: 'Now',
    workspace: 'Workspace',
    ...overrides,
  };
}

/** Creates a workflow item fixture. */
function createItem(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    activity: {
      archivedEventCount: 0,
      hasOlderEvents: false,
      rollingSummary: null,
      totalEventCount: 0,
    },
    artifactFolderName: 'item-1',
    brief: 'Brief',
    createdAt: Date.parse('2026-04-10T08:00:00.000Z'),
    id: 'item-1',
    primaryAgentId: 'agent-1',
    projectId: 'project-1',
    scheduledTaskId: null,
    sortOrder: 0,
    status: 'active',
    tasks: [],
    title: 'Refactor auth',
    updatedAt: Date.parse('2026-04-10T08:00:00.000Z'),
    workProducts: [],
    workflowEvents: [],
    ...overrides,
  };
}

describe('AgentTimeline', () => {
  beforeEach(() => {
    resetAppStore();
  });

  afterEach(() => {
    resetAppStore();
  });

  it('aggregates workflow and activity events in reverse chronological order', () => {
    useAppStore.setState((state) => ({
      ...state,
      items: [
        createItem({
          workflowEvents: [
            {
              actor: 'Navigator',
              createdAt: Date.parse('2026-04-12T09:00:00.000Z'),
              description: 'Picked up the auth refactor.',
              id: 'workflow-1',
              kind: 'assignment',
            },
            {
              actor: 'Other agent',
              createdAt: Date.parse('2026-04-11T09:00:00.000Z'),
              description: 'This should be ignored.',
              id: 'workflow-ignored',
              kind: 'note',
            },
          ],
        }),
        createItem({
          id: 'item-2',
          projectId: 'project-2',
          title: 'Ship billing UI',
          workflowEvents: [
            {
              actor: 'Navigator',
              createdAt: Date.parse('2026-04-13T11:00:00.000Z'),
              description: 'Closed the billing checklist.',
              id: 'workflow-2',
              kind: 'task',
            },
          ],
        }),
      ],
    }));

    render(
      <AgentTimeline
        agent={createAgent({
          activityEvents: [
            {
              detail: 'Ran pnpm test and copied the failures into the work log.',
              id: 'activity-1',
              kind: 'tool',
              label: 'Executed pnpm test',
              timestamp: Date.parse('2026-04-14T12:00:00.000Z'),
            },
          ],
        })}
      />,
    );

    const events = screen.getAllByTestId('agent-timeline-event');
    expect(events).toHaveLength(3);
    const firstEvent = events[0];
    const secondEvent = events[1];
    const thirdEvent = events[2];

    if (!firstEvent || !secondEvent || !thirdEvent) {
      throw new Error('Expected three timeline events.');
    }

    expect(within(firstEvent).getByText('Executed pnpm test')).toBeInTheDocument();
    expect(within(secondEvent).getByText('Closed the billing checklist.')).toBeInTheDocument();
    expect(within(thirdEvent).getByText('Picked up the auth refactor.')).toBeInTheDocument();
    expect(screen.queryByText('This should be ignored.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ship billing UI/i })).toBeInTheDocument();
  });

  it('filters the timeline by type and date range', async () => {
    const user = userEvent.setup();

    useAppStore.setState((state) => ({
      ...state,
      items: [
        createItem({
          workflowEvents: [
            {
              actor: 'Navigator',
              createdAt: Date.parse('2026-04-10T09:00:00.000Z'),
              description: 'Captured reviewer feedback.',
              id: 'workflow-1',
              kind: 'feedback',
            },
          ],
        }),
      ],
    }));

    render(
      <AgentTimeline
        agent={createAgent({
          activityEvents: [
            {
              id: 'activity-1',
              kind: 'tool',
              label: 'Executed pnpm test',
              timestamp: Date.parse('2026-04-14T12:00:00.000Z'),
            },
            {
              id: 'activity-2',
              kind: 'status',
              label: 'Marked the handoff complete',
              timestamp: Date.parse('2026-04-15T12:00:00.000Z'),
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Tool$/i }));
    expect(screen.queryByText('Executed pnpm test')).not.toBeInTheDocument();
    expect(screen.getByText('Marked the handoff complete')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-15' } });
    expect(screen.queryByText('Captured reviewer feedback.')).not.toBeInTheDocument();
    expect(screen.getByText('Marked the handoff complete')).toBeInTheDocument();
  });

  it('exports the filtered timeline as markdown and includes expanded detail', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn((value: string) => {
      void value;
      return Promise.resolve(undefined);
    });

    window.duneDesktop = {
      ...window.duneDesktop,
      copyText,
      platform: window.duneDesktop?.platform ?? 'darwin',
    };

    useAppStore.setState((state) => ({
      ...state,
      items: [
        createItem({
          workflowEvents: [
            {
              actor: 'Navigator',
              createdAt: Date.parse('2026-04-12T09:00:00.000Z'),
              description: 'Picked up the auth refactor.',
              id: 'workflow-1',
              kind: 'assignment',
            },
          ],
        }),
      ],
    }));

    render(
      <AgentTimeline
        agent={createAgent({
          activityEvents: [
            {
              detail: 'Ran pnpm test and copied the failures into the work log.',
              id: 'activity-1',
              kind: 'tool',
              label: 'Executed pnpm test',
              timestamp: Date.parse('2026-04-14T12:00:00.000Z'),
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Toggle timeline event Executed pnpm test/i }));
    await user.click(screen.getByRole('button', { name: /Export as Markdown/i }));

    expect(copyText).toHaveBeenCalledTimes(1);
    const markdown = copyText.mock.calls[0]?.[0] ?? '';
    expect(markdown).toContain('# Agent Timeline: Navigator');
    expect(markdown).toContain('**Actor:** Navigator');
    expect(markdown).toContain('**Work item:** Refactor auth');
    expect(markdown).toContain('Executed pnpm test');
    expect(markdown).toContain('> Ran pnpm test and copied the failures into the work log.');
  });
});
