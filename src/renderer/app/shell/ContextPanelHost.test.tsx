import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextPanelHost } from '@/renderer/app/shell/ContextPanelHost';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
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
    contextCards: [],
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

describe('ContextPanelHost', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState((state) => ({
      ...state,
      agents: [createAgent()],
      selectedAgentId: 'agent-1',
    }));
  });

  it('opens a centered customization modal in inline mode and saves to local store', async () => {
    const user = userEvent.setup();

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="inline"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Edit customization/i }));

    expect(
      await screen.findByRole('heading', { name: /Edit customization/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Additive instructions'), 'Stay concise.');
    await user.click(screen.getByRole('button', { name: /^Save draft$/i }));

    await waitFor(() => {
      expect(useAppStore.getState().agentCustomizations['agent-1']).toEqual(
        expect.objectContaining({
          additionalInstructions: 'Stay concise.',
        }),
      );
    });
  });

  it('reuses the drawer surface for customization editing in overlay mode', async () => {
    const user = userEvent.setup();

    render(
      <ContextPanelHost
        agent={createAgent()}
        customization={null}
        mode="overlay"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Edit customization/i }));

    expect(
      await screen.findByRole('heading', { name: /Edit customization/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to inspector/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Back to inspector/i }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Edit customization/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });
});
