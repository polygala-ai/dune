// Agent activity panel tests.

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { AgentActivityUpdatePayload } from '@/shared/agents/agent-activity';
import { AgentActivityPanel } from '@/renderer/features/agents/components/AgentActivityPanel';

describe('AgentActivityPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('renders the initial activity snapshot with relative timing', async () => {
    const now = Date.now();

    window.duneDesktop = {
      ...(window.duneDesktop ?? { platform: 'darwin' as const }),
      getAgentActivity: vi.fn().mockResolvedValue({
        agents: [
          {
            agentId: 'agent-1',
            agentName: 'Navigator',
            isAlive: true,
            status: {
              schemaVersion: 1,
              updatedAt: new Date(now - 2_000).toISOString(),
              agentId: 'agent-1',
              agentName: 'Navigator',
              status: 'working',
              phase: 'tool_call_start',
              currentTool: 'search_query',
              toolArgsSummary: 'Searching the docs',
              lastToolDurationMs: 120,
              turnCount: 3,
              workItemId: 'item-1',
              workItemTitle: 'Ship observability panel',
              sessionId: 'session-1',
              sessionStartedAt: new Date(now - 300_000).toISOString(),
            },
          },
        ],
      }),
    };

    render(<AgentActivityPanel />);

    expect(await screen.findByText('Navigator')).toBeInTheDocument();
    expect(screen.getByText('search_query')).toBeInTheDocument();
    expect(screen.getByText('Ship observability panel')).toBeInTheDocument();
    expect(screen.getByText(/\ds ago/i)).toBeInTheDocument();
  });

  it('applies live activity updates and persists the collapsed state', async () => {
    let listener: ((payload: AgentActivityUpdatePayload) => void) | null = null;
    const subscribeAgentActivity = vi.fn((nextListener: (payload: AgentActivityUpdatePayload) => void) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    });

    window.duneDesktop = {
      ...(window.duneDesktop ?? { platform: 'darwin' as const }),
      getAgentActivity: vi.fn().mockResolvedValue({ agents: [] }),
      subscribeAgentActivity,
    };

    render(<AgentActivityPanel />);

    await waitFor(() => {
      expect(subscribeAgentActivity).toHaveBeenCalledTimes(1);
    });

    const toggle = screen.getByRole('button', { name: /activity/i });
    fireEvent.click(toggle);
    expect(window.localStorage.getItem('dune.agent-activity-panel.open')).toBe('false');

    fireEvent.click(toggle);

    act(() => {
      listener?.({
        agentId: 'agent-2',
        agentName: 'Researcher',
        isAlive: true,
        status: {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          agentId: 'agent-2',
          agentName: 'Researcher',
          status: 'idle',
          phase: 'tool_call_done',
          currentTool: 'read_file',
          toolArgsSummary: 'Read the latest status file',
          lastToolDurationMs: 88,
          turnCount: 1,
          workItemId: null,
          workItemTitle: null,
          sessionId: 'session-2',
          sessionStartedAt: new Date().toISOString(),
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Researcher')).toBeInTheDocument();
    });
    expect(screen.getByText('Read the latest status file')).toBeInTheDocument();
  });
});
