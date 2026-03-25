import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';
import type { PresentedAgent } from '@/renderer/features/agents/types';

function createAgent(): PresentedAgent {
  return {
    channel: {
      canCompose: true,
      id: 'dune-chat',
      kind: 'built-in',
      label: 'Dune chat',
      status: 'ready',
    },
    contextCards: [],
    id: 'agent-1',
    messages: [],
    name: 'Navigator',
    note: 'A durable agent workspace.',
    preview: 'Ready for a first instruction.',
    status: 'ready',
    statusLabel: 'Ready',
    updatedAt: Date.now(),
    updatedLabel: 'Now',
    workspace: 'Prototype agent',
  };
}

describe('AgentContextPanel', () => {
  it('shows channel and status without mode or access labels', () => {
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
    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Access')).not.toBeInTheDocument();
  });
});
