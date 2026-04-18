// Agent context panel tests.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';
import { createEmptyAgentCustomizationDraft } from '@/renderer/features/agents/model/agent-customization';
import type { PresentedAgent } from '@/renderer/features/agents/types';

/** Creates agent. */
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
    activityEvents: [],
    codingEngineEvents: [],
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
    definition: { archetype: 'custom', responsibilities: [] },
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
  it('surfaces agent identity while preserving connection details and filtered cards', () => {
    render(
      <AgentContextPanel
        agent={createAgent()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Agent name')).toBeInTheDocument();
    expect(screen.getByText('Navigator')).toBeInTheDocument();
    expect(screen.getByText('Agent ID')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Dune chat')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getByText('Pinned workspace context')).toBeInTheDocument();
    expect(
      screen.getByText('The project brief stays pinned here for handoff context.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Prototype agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent brief')).not.toBeInTheDocument();
    expect(screen.queryByText('A durable agent workspace.')).not.toBeInTheDocument();
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
        agent={createAgent({ definition: { archetype: 'project-main', responsibilities: [] } })}
        onClose={vi.fn()}
        onDeleteAgent={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Delete agent$/i })).not.toBeInTheDocument();
  });

  it('shows inherited customization defaults when no local draft exists', () => {
    render(
      <AgentContextPanel
        agent={createAgent()}
        customization={null}
        onClose={vi.fn()}
        onEditCustomization={vi.fn()}
      />,
    );

    expect(screen.getByText('Customization')).toBeInTheDocument();
    expect(screen.getByText('Inherited defaults')).toBeInTheDocument();
    expect(screen.getByText('No local draft is attached to this agent yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit customization/i })).toBeInTheDocument();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
    expect(screen.getByText('Inherited')).toBeInTheDocument();
  });

  it('summarizes local customization drafts', () => {
    render(
      <AgentContextPanel
        agent={createAgent()}
        customization={{
          ...createEmptyAgentCustomizationDraft(),
          additionalInstructions: 'Stay concise.',
          mcpServers: [
            {
              args: '',
              command: 'node',
              enabled: true,
              env: [],
              id: 'mcp-1',
              name: 'repo_tools',
              source: '/tmp/repo-tools',
            },
          ],
          skills: [
            {
              id: 'skill-1',
              isDiscovered: false,
              name: 'Release notes',
              origin: 'manual',
              path: '/tmp/release-notes',
            },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Session draft active')).toBeInTheDocument();
    expect(screen.getByText('Saved locally in renderer memory for this session.')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('lets the inspector switch a Telegram agent back to Dune chat', async () => {
    const user = userEvent.setup();
    const onUpdateChannel = vi.fn(async () => undefined);

    render(
      <AgentContextPanel
        agent={createAgent({
          channel: {
            canCompose: false,
            id: 'telegram',
            kind: 'external',
            label: 'Telegram',
            status: 'connected',
            target: {
              channelId: 'telegram',
              jid: 'tg:123',
              kind: 'group',
              name: 'Product QA',
            },
          },
          telegram: {
            botUsername: 'agentlite_test_bot',
            boundChat: {
              channelId: 'telegram',
              jid: 'tg:123',
              kind: 'group',
              name: 'Product QA',
            },
            errorMessage: null,
            pairCode: null,
            pairExpiresAt: null,
            pairingStatus: 'idle',
            status: 'connected',
          },
        })}
        onClose={vi.fn()}
        onUpdateChannel={onUpdateChannel}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Change channel'),
      'dune-chat',
    );
    await user.click(screen.getByRole('button', { name: /Save channel/i }));

    expect(onUpdateChannel).toHaveBeenCalledWith({
      channelId: 'dune-chat',
    });
  });

  it('opens Telegram setup in a popup when Telegram is selected', async () => {
    const user = userEvent.setup();
    const onOpenTelegramSetup = vi.fn();

    render(
      <AgentContextPanel
        agent={createAgent()}
        onClose={vi.fn()}
        onOpenTelegramSetup={onOpenTelegramSetup}
        onUpdateChannel={vi.fn(async () => undefined)}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Change channel'),
      'telegram',
    );

    expect(onOpenTelegramSetup).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Open Telegram setup in a popup/i),
    ).toBeInTheDocument();
  });

  it('saves a paired Telegram channel from the inspector', async () => {
    const user = userEvent.setup();
    const onUpdateChannel = vi.fn(async () => undefined);

    render(
      <AgentContextPanel
        agent={createAgent()}
        onClose={vi.fn()}
        onOpenTelegramSetup={vi.fn()}
        onUpdateChannel={onUpdateChannel}
        telegramSetupSession={{
          agentId: 'agent-1',
          botUsername: 'agentlite_test_bot',
          errorMessage: null,
          id: 'telegram-session-1',
          matchedChat: {
            channelId: 'telegram',
            jid: 'tg:123',
            kind: 'group',
            name: 'Product QA',
          },
          pairCode: null,
          pairExpiresAt: null,
          pairingStatus: 'matched',
          status: 'connected',
        }}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Change channel'),
      'telegram',
    );
    await user.click(screen.getByRole('button', { name: /Save Telegram channel/i }));

    expect(onUpdateChannel).toHaveBeenCalledWith({
      channelId: 'telegram',
      telegramSetupSessionId: 'telegram-session-1',
    });
  });
});
