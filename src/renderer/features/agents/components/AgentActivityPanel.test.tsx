import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import { createSeedWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import type { AgentActivityStatus } from '@/shared/agents/agent-activity';

import { AgentActivityPanel } from './AgentActivityPanel';

const PANEL_OPEN_STORAGE_KEY = 'dune.agent-activity-panel.open';

function createActivityStatus(
  overrides: Partial<AgentActivityStatus> = {},
): AgentActivityStatus {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    agentId: 'agent-1',
    agentName: 'Navigator',
    status: 'tool-calling',
    phase: 'tool_call_start',
    currentTool: 'Read',
    toolArgsSummary: 'file: status.json',
    lastToolDurationMs: null,
    lastToolResult: null,
    turnCount: 3,
    workItemId: null,
    workItemTitle: null,
    sessionId: 'session-1',
    sessionStartedAt: '2026-04-19T10:00:00.000Z',
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
    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      getAgentActivity: vi.fn(async () => [
        createActivityStatus({
          lastToolResult: '{"ok":true}',
          workItemId: firstItem?.id ?? null,
        }),
      ]),
      subscribeAgentActivity: vi.fn(() => () => undefined),
    };

    render(<AgentActivityPanel />);

    expect(await screen.findByText('Navigator')).toBeInTheDocument();
    expect(screen.getByText('Read · file: status.json')).toBeInTheDocument();
    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
    expect(screen.getByText('Tool calling')).toBeInTheDocument();
    expect(screen.getByText(firstItem?.title ?? '')).toBeInTheDocument();
  });

  it('persists the open and closed state in local storage', async () => {
    const user = userEvent.setup();

    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      getAgentActivity: vi.fn(async () => [createActivityStatus()]),
      subscribeAgentActivity: vi.fn(() => () => undefined),
    };

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

  it('applies live updates from the desktop bridge subscription', async () => {
    let listener: ((statuses: AgentActivityStatus[]) => void) | null = null;

    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      getAgentActivity: vi.fn(async () => []),
      subscribeAgentActivity: vi.fn((nextListener) => {
        listener = nextListener;
        return () => undefined;
      }),
    };

    render(<AgentActivityPanel />);

    expect(await screen.findByText('No live agent activity yet.')).toBeInTheDocument();

    act(() => {
      listener?.([createActivityStatus()]);
    });

    expect(await screen.findByText('Navigator')).toBeInTheDocument();
  });
});
