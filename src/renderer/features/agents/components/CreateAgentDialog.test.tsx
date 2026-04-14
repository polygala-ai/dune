// Create agent dialog tests.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateAgentDialog } from '@/renderer/features/agents/components/CreateAgentDialog';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import type {
  CreateAgentInput,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';

/** Creates snapshot. */
function createSnapshot(
  overrides: Partial<AgentServiceSnapshot> = {},
): AgentServiceSnapshot {
  return {
    agents: [],
    codingEngines: [],
    externalChannels: createDefaultExternalChannelsState(),
    isStreaming: false,
    runtimeInfo: {
      message: 'Ready',
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: null,
    telegramSetupSessions: [],
    ...overrides,
  };
}

describe('CreateAgentDialog', () => {
  const projects = [
    {
      color: '#A86D46',
      createdAt: 1,
      description: 'Project workspace',
      id: 'project-1',
      name: 'Research Platform',
      rootPath: null,
      updatedAt: 1,
    },
  ];

  beforeEach(() => {
    resetAppStore();
  });

  afterEach(() => {
    resetAppStore();
  });

  function renderDialog(options: {
    onCreateAgent?: (input: CreateAgentInput) => Promise<string>;
  } = {}) {
    render(
      <CreateAgentDialog
        defaultProjectId="project-1"
        existingAgents={[]}
        externalChannels={createDefaultExternalChannelsState()}
        onCreateAgent={options.onCreateAgent ?? vi.fn().mockResolvedValue('agent-1')}
        onOpenChange={vi.fn()}
        open
        projects={projects}
      />,
    );
  }

  it('shows a compact channel trigger and keeps Telegram selectable in the popover', async () => {
    const user = userEvent.setup();

    renderDialog();

    const trigger = screen.getByRole('button', { name: /Channel: Dune chat/i });

    expect(trigger).toBeInTheDocument();
    expect(screen.queryByTestId('channel-select-popover')).not.toBeInTheDocument();

    await user.click(trigger);

    const popover = await screen.findByTestId('channel-select-popover');

    expect(within(popover).getByRole('button', { name: /Select Dune chat/i })).toBeEnabled();
    expect(within(popover).getByRole('button', { name: /Select Telegram/i })).toBeEnabled();
    expect(within(popover).getByRole('button', { name: /Select Slack/i })).toBeDisabled();
    expect(within(popover).getByRole('button', { name: /Select Discord/i })).toBeDisabled();
  });

  it('preserves the default channel and submits structured dune-chat agent input', async () => {
    const user = userEvent.setup();
    const onCreateAgent = vi.fn().mockResolvedValue('agent-1');

    renderDialog({ onCreateAgent });

    await user.type(screen.getByLabelText('Agent name'), 'Navigator');
    await user.click(screen.getByRole('button', { name: /^Create agent$/i }));

    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalledWith({
        channelId: 'dune-chat',
        name: 'Navigator',
        projectId: 'project-1',
        projectName: 'Research Platform',
        projectRootPath: null,
      });
    });
  });

  it('stores customization drafts locally without changing the create payload', async () => {
    const user = userEvent.setup();
    const onCreateAgent = vi.fn().mockResolvedValue('agent-7');

    renderDialog({ onCreateAgent });

    await user.type(screen.getByLabelText('Agent name'), 'Navigator');
    await user.click(screen.getByRole('button', { name: /No customizations/i }));

    await user.type(
      screen.getByLabelText('Additive instructions'),
      'Flag release blockers before proposing workarounds.',
    );
    await user.click(screen.getByRole('button', { name: /^Add folder$/i }));
    await user.type(screen.getByLabelText('Skill name'), 'Release notes');
    await user.type(
      screen.getByLabelText('Folder path'),
      '/Users/test/.codex/skills/release-notes',
    );
    await user.click(screen.getByRole('button', { name: /^Add MCP server$/i }));
    await user.type(screen.getByLabelText('Server name'), 'repo_tools');
    await user.type(screen.getByLabelText('Source folder'), '/Users/test/dev/repo-tools');
    await user.type(screen.getByLabelText('Command'), 'node');

    await user.click(screen.getByRole('button', { name: /^Create agent$/i }));

    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalledWith({
        channelId: 'dune-chat',
        name: 'Navigator',
        projectId: 'project-1',
        projectName: 'Research Platform',
        projectRootPath: null,
      });
    });

    expect(useAppStore.getState().agentCustomizations['agent-7']).toEqual(
      expect.objectContaining({
        additionalInstructions: 'Flag release blockers before proposing workarounds.',
        skills: [
          expect.objectContaining({
            name: 'Release notes',
            path: '/Users/test/.codex/skills/release-notes',
          }),
        ],
        mcpServers: [
          expect.objectContaining({
            command: 'node',
            name: 'repo_tools',
            source: '/Users/test/dev/repo-tools',
          }),
        ],
      }),
    );
  });

  it('shows the inline Telegram wizard and keeps create disabled until a setup session is matched', async () => {
    const user = userEvent.setup();

    window.duneDesktop = {
      ...window.duneDesktop,
      getRuntimeSnapshot: vi.fn(async () => createSnapshot({
        telegramSetupSessions: useAppStore.getState().telegramSetupSessions,
      })),
      platform: 'darwin',
      startTelegramSetupSession: vi.fn(async () => {
        const session: TelegramSetupSession = {
          agentId: null,
          botUsername: 'agentlite_test_bot',
          errorMessage: null,
          id: 'telegram-session-1',
          matchedChat: null,
          pairCode: 'PAIR42',
          pairExpiresAt: Date.now() + 10 * 60 * 1000,
          pairingStatus: 'listening',
          status: 'connected',
        };

        useAppStore.getState().setAgentsSnapshot(createSnapshot({
          telegramSetupSessions: [session],
        }));

        return session.id;
      }),
    };

    renderDialog();

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(await screen.findByRole('button', { name: /Select Telegram/i }));
    await user.type(screen.getByLabelText('Agent name'), 'Release triage');

    expect(await screen.findByRole('heading', { name: /Telegram setup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create agent$/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /I already have a token/i }));
    await user.type(screen.getByLabelText('Bot token'), '123456:test-token');
    await user.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() => {
      expect(screen.getByTestId('telegram-wizard-step-pairing')).toBeInTheDocument();
    });
    expect(screen.getByText('/pair PAIR42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create agent$/i })).toBeDisabled();
  });

  it('submits the matched Telegram setup session after pairing succeeds', async () => {
    const user = userEvent.setup();
    const onCreateAgent = vi.fn().mockResolvedValue('agent-1');

    window.duneDesktop = {
      ...window.duneDesktop,
      getRuntimeSnapshot: vi.fn(async () => createSnapshot({
        telegramSetupSessions: useAppStore.getState().telegramSetupSessions,
      })),
      platform: 'darwin',
      startTelegramSetupSession: vi.fn(async () => {
        const session: TelegramSetupSession = {
          agentId: null,
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
        };

        useAppStore.getState().setAgentsSnapshot(createSnapshot({
          telegramSetupSessions: [session],
        }));

        return session.id;
      }),
    };

    renderDialog({ onCreateAgent });

    await user.click(screen.getByRole('button', { name: /Channel: Dune chat/i }));
    await user.click(await screen.findByRole('button', { name: /Select Telegram/i }));
    await user.click(screen.getByRole('button', { name: /I already have a token/i }));
    await user.type(screen.getByLabelText('Bot token'), '123456:test-token');
    await user.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() => {
      expect(screen.getByText('Telegram pairing matched Product QA.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Agent name'), 'Release triage');
    await user.click(screen.getByRole('button', { name: /^Create agent$/i }));

    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalledWith({
        channelId: 'telegram',
        name: 'Release triage',
        projectId: 'project-1',
        projectName: 'Research Platform',
        projectRootPath: null,
        telegramSetupSessionId: 'telegram-session-1',
      });
    });
  });
});
