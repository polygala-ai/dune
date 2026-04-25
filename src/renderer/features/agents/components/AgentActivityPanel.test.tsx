import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import { createSeedWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import type { Agent, AgentActivityEvent } from '@/renderer/features/agents/types';

import { AgentActivityPanel } from './AgentActivityPanel';

const PANEL_OPEN_STORAGE_KEY = 'dune.agent-activity-panel.open';

function createActivityEvent(
  overrides: Partial<AgentActivityEvent> = {},
): AgentActivityEvent {
  return {
    id: 'activity-1',
    kind: 'tool',
    label: 'Read',
    detail: 'file: status.json',
    timestamp: Date.now(),
    ...overrides,
  };
}

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    activityEvents: [createActivityEvent()],
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
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    projectId: 'project-1',
    status: 'ready',
    telegram: null,
    transcript: {
      archivedMessageCount: 0,
      hasOlderMessages: false,
      rollingSummary: null,
      totalMessageCount: 0,
    },
    updatedAt: Date.now(),
    workItemId: null,
    workspace: 'AgentLite agent',
    ...overrides,
  };
}

describe('AgentActivityPanel', () => {
  beforeEach(() => {
    resetAppStore();
    window.localStorage.removeItem(PANEL_OPEN_STORAGE_KEY);
  });

  it('renders initial activity and resolves work item titles from the workflow store', async () => {
    const workflowSnapshot = createSeedWorkflowSnapshot(1_700_000_000_000);
    const [firstItem] = workflowSnapshot.items;

    useAppStore.getState().hydrateWorkflow(workflowSnapshot);
    useAppStore.setState({
      agents: [
        createAgent({
          activityEvents: [
            createActivityEvent({ id: 'tool-1', label: 'Read', detail: 'file: status.json' }),
            createActivityEvent({
              id: 'result-1',
              kind: 'tool',
              label: 'result:tool-1',
              detail: '{"ok":true}',
              timestamp: Date.now() - 1,
            }),
          ],
          workItemId: firstItem?.id ?? null,
        }),
      ],
    });

    render(<AgentActivityPanel />);

    expect(await screen.findByText('Navigator')).toBeInTheDocument();
    expect(screen.getByText('Read · file: status.json')).toBeInTheDocument();
    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
    expect(screen.getByText('Tool calling')).toBeInTheDocument();
    expect(screen.getByText(firstItem?.title ?? '')).toBeInTheDocument();
  });

  it('persists the open and closed state in local storage', async () => {
    const user = userEvent.setup();

    useAppStore.setState({ agents: [createAgent()] });

    render(<AgentActivityPanel />);

    const toggle = await screen.findByRole('button', {
      name: 'Hide agent activity',
    });
    await user.click(toggle);

    expect(window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY)).toBe('false');
    expect(screen.queryByText('Read · file: status.json')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show agent activity' }),
    ).toBeInTheDocument();
  });

  it('applies live updates from the agent store', async () => {
    render(<AgentActivityPanel />);

    expect(await screen.findByText('No live agent activity yet.')).toBeInTheDocument();

    act(() => {
      useAppStore.setState({ agents: [createAgent()] });
    });

    expect(await screen.findByText('Navigator')).toBeInTheDocument();
  });
});
