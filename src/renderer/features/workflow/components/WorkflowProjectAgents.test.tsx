// Workflow project-agent tests.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowProjectAgents } from '@/renderer/features/workflow/components/WorkflowProjectAgents';

describe('WorkflowProjectAgents', () => {
  const readyRuntimeInfo = {
    mode: 'real' as const,
    status: 'ready' as const,
  };

  it('shows an initializing panel while the runtime is starting and no agents are loaded', () => {
    render(
      <WorkflowProjectAgents
        agents={[]}
        onOpenAgent={vi.fn()}
        onOpenItem={vi.fn()}
        runtimeInfo={{
          message: 'Connecting to the desktop runtime.',
          mode: 'real',
          status: 'starting',
        }}
      />,
    );

    expect(screen.getByText('Initializing agents')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preparing the agent runtime' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Dune is connecting to AgentLite and loading this project's agents. This usually takes a few seconds.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Connecting to the desktop runtime.')).toBeInTheDocument();
    expect(
      screen.getByText('Agent controls will appear here as soon as initialization finishes.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'No agents yet. Create the first project agent when a work item is ready for execution.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the empty state once runtime startup has finished with no agents', () => {
    render(
      <WorkflowProjectAgents
        agents={[]}
        onOpenAgent={vi.fn()}
        onOpenItem={vi.fn()}
        runtimeInfo={readyRuntimeInfo}
      />,
    );

    expect(
      screen.getByText(
        'No agents yet. Create the first project agent when a work item is ready for execution.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Initializing agents')).not.toBeInTheDocument();
  });

  it('marks the built-in project main agent in the agents list even while runtime is starting', () => {
    render(
      <WorkflowProjectAgents
        agents={[
          {
            currentItemId: null,
            currentItemTitle: null,
            id: 'agent-main',
            isProjectMain: true,
            name: 'Paul Atreides',
            statusLabel: 'Ready',
            updatedLabel: 'just now',
          },
          {
            currentItemId: null,
            currentItemTitle: null,
            id: 'agent-custom',
            isProjectMain: false,
            name: 'Research agent',
            statusLabel: 'Streaming',
            updatedLabel: '2m ago',
          },
        ]}
        onOpenAgent={vi.fn()}
        onOpenItem={vi.fn()}
        runtimeInfo={{
          message: 'Connecting to the desktop runtime.',
          mode: 'real',
          status: 'starting',
        }}
      />,
    );

    expect(screen.getByText('Paul Atreides')).toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Research agent')).toBeInTheDocument();
    expect(screen.getAllByText('No current work item')).toHaveLength(2);
    expect(screen.queryByText('Initializing agents')).not.toBeInTheDocument();
  });
});
