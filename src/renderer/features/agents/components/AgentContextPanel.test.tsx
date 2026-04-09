import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';
import type { PresentedAgent } from '@/renderer/features/agents/types';

function createAgent(
  overrides: Partial<PresentedAgent> = {},
): PresentedAgent {
  return {
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    contextCards: [
      {
        body: 'This agent now runs through AgentLite from the Dune runtime root under ~/.dune/agentlite.',
        eyebrow: 'Runtime',
        id: 'context-runtime',
        title: 'AgentLite is driving this workspace',
      },
      {
        body: 'The main process owns the runtime bridge and forwards live AgentLite snapshot updates back into the renderer.',
        eyebrow: 'Bridge',
        id: 'context-bridge',
        title: 'Desktop-managed runtime',
      },
      {
        body: 'Dune chat is built in and writable here, so the agent behaves like a long-lived workspace inside the app.',
        eyebrow: 'Connection',
        id: 'context-connection',
        title: 'Dune chat is attached by default',
      },
      {
        body: 'Responses are still mocked in this phase, but the shell is shaped to match the AgentLite model that will replace them.',
        eyebrow: 'Phase one',
        id: 'context-phase',
        title: 'UI first, runtime next',
      },
      {
        body: 'The project brief stays pinned here for handoff context.',
        eyebrow: 'Briefing',
        id: 'context-briefing',
        title: 'Pinned workspace context',
      },
    ],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    projectId: 'project-1',
    role: 'custom',
    status: 'ready',
    statusLabel: 'Ready',
    telegram: null,
    updatedAt: Date.now(),
    updatedLabel: 'Now',
    workspace: 'Prototype agent',
    ...overrides,
  };
}

describe('AgentContextPanel', () => {
  it('hides runtime and mock setup cards while preserving connection details and other cards', () => {
    render(
      <AgentContextPanel
        agent={createAgent()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Dune chat')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Pinned workspace context')).toBeInTheDocument();
    expect(
      screen.getByText('The project brief stays pinned here for handoff context.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('AgentLite is driving this workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Desktop-managed runtime')).not.toBeInTheDocument();
    expect(screen.queryByText('Dune chat is attached by default')).not.toBeInTheDocument();
    expect(screen.queryByText('UI first, runtime next')).not.toBeInTheDocument();
  });

  it('shows the delete action for custom agents only', () => {
    const { rerender } = render(
      <AgentContextPanel
        agent={createAgent()}
        onClose={vi.fn()}
        onDeleteAgent={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^Delete agent$/i })).toBeInTheDocument();

    rerender(
      <AgentContextPanel
        agent={createAgent({ role: 'project-main' })}
        onClose={vi.fn()}
        onDeleteAgent={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Delete agent$/i })).not.toBeInTheDocument();
  });
});
