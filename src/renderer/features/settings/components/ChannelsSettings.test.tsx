import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import { createDefaultExternalChannelsState } from '@/renderer/features/agents/model/channels';
import type {
  Agent,
  ExternalChannelsState,
} from '@/renderer/features/agents/types';
import { TELEGRAM_BOT_TOKEN_SECRET_KEY } from '@/renderer/features/settings/model/telegram-channel';

import { ChannelsSettings } from './ChannelsSettings';

function createTelegramAgent(chatName: string, chatJid: string): Agent {
  return {
    channel: {
      canCompose: false,
      id: 'telegram',
      kind: 'external',
      label: 'Telegram',
      status: 'connected',
      target: {
        channelId: 'telegram',
        jid: chatJid,
        kind: 'group',
        name: chatName,
      },
    },
    contextCards: [],
    id: `agent-${chatJid}`,
    messages: [],
    name: 'QA triage',
    note: 'Mirrors Telegram.',
    preview: `Attached to ${chatName}.`,
    projectId: null,
    status: 'ready',
    updatedAt: 1,
    workspace: 'AgentLite agent',
  };
}

function createRuntimeSnapshot(
  externalChannels: ExternalChannelsState,
): AgentServiceSnapshot {
  return {
    agents: [],
    externalChannels,
    isStreaming: false,
    runtimeInfo: {
      mode: 'real',
      status: 'ready',
    },
    selectedAgentId: null,
  };
}

function createDesktopBridge(options: {
  runtimeSnapshot?: AgentServiceSnapshot;
  storedToken?: string;
} = {}) {
  const secrets = new Map<string, string>();
  const storedToken = options.storedToken ?? '';

  if (storedToken) {
    secrets.set(TELEGRAM_BOT_TOKEN_SECRET_KEY, storedToken);
  }

  return {
    copyText: vi.fn(async () => undefined),
    getRuntimeSnapshot: vi.fn(
      async () => options.runtimeSnapshot ?? createRuntimeSnapshot(createDefaultExternalChannelsState()),
    ),
    openExternal: vi.fn(async () => undefined),
    platform: 'darwin' as const,
    reloadExternalChannels: vi.fn(async () => undefined),
    storageDelete: vi.fn(async (_store: string, key: string) => {
      secrets.delete(key);
    }),
    storageGet: vi.fn(async (_store: string, key: string) => secrets.get(key) ?? null),
    storageSet: vi.fn(async (_store: string, key: string, value: unknown) => {
      secrets.set(key, String(value));
    }),
  };
}

function renderChannelsSettings(options: {
  agents?: Agent[];
  externalChannels?: ExternalChannelsState;
  runtimeSnapshot?: AgentServiceSnapshot;
  storedToken?: string;
} = {}) {
  window.duneDesktop = createDesktopBridge({
    ...(options.runtimeSnapshot ? { runtimeSnapshot: options.runtimeSnapshot } : {}),
    storedToken: options.storedToken ?? '',
  });

  render(
    <ChannelsSettings
      agents={options.agents ?? []}
      externalChannels={options.externalChannels ?? createDefaultExternalChannelsState()}
      onThemeChange={vi.fn()}
      runtimeInfo={{ mode: 'real', status: 'ready' }}
      themePreference="system"
    />,
  );

  return window.duneDesktop;
}

describe('ChannelsSettings', () => {
  it('renders a simplified channels intro without the runtime banner', async () => {
    renderChannelsSettings();

    expect(await screen.findByRole('heading', { name: 'Channels' })).toBeInTheDocument();
    expect(
      screen.queryByText('Set up Telegram and future external channels for agents.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime status')).not.toBeInTheDocument();
    expect(screen.queryByText('Mock fallback')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting Dune runtime.')).not.toBeInTheDocument();
  });

  it('renders discovered Telegram chats with in-use availability', async () => {
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [
          {
            channelId: 'telegram',
            jid: 'tg:group',
            kind: 'group',
            lastSeenAt: 2,
            name: 'Product QA',
          },
          {
            channelId: 'telegram',
            jid: 'tg:dm',
            kind: 'dm',
            lastSeenAt: 1,
            name: 'Alice Chen',
          },
        ],
        errorMessage: null,
        status: 'connected',
      },
    };

    renderChannelsSettings({
      agents: [createTelegramAgent('Product QA', 'tg:group')],
      externalChannels,
      storedToken: 'bot-token',
    });

    expect(await screen.findByDisplayValue('bot-token')).toBeInTheDocument();
    expect(screen.getByText('@agentlite_test_bot')).toBeInTheDocument();
    expect(screen.getByText('Product QA')).toBeInTheDocument();
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('In use')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('saves the Telegram token into secure storage and reloads the runtime', async () => {
    const user = userEvent.setup();
    const duneDesktop = renderChannelsSettings();

    const input = await screen.findByLabelText('Bot token');
    await user.type(input, 'telegram-bot-token');
    await user.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() => {
      expect(duneDesktop.storageSet).toHaveBeenCalledWith(
        'secrets',
        TELEGRAM_BOT_TOKEN_SECRET_KEY,
        'telegram-bot-token',
      );
      expect(duneDesktop.reloadExternalChannels).toHaveBeenCalledTimes(1);
    });
  });

  it('opens BotFather through the desktop bridge', async () => {
    const user = userEvent.setup();
    const duneDesktop = renderChannelsSettings();

    await user.click(await screen.findByRole('button', { name: /Open BotFather/i }));

    expect(duneDesktop.openExternal).toHaveBeenCalledWith('https://t.me/BotFather');
  });

  it('shows guided Telegram onboarding with open and copy actions for the connected bot', async () => {
    const user = userEvent.setup();
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [],
        errorMessage: null,
        status: 'connected',
      },
    };
    const duneDesktop = renderChannelsSettings({
      externalChannels,
      storedToken: 'bot-token',
    });

    expect(await screen.findByText('No chats discovered yet')).toBeInTheDocument();
    expect(
      screen.getByText('Open @agentlite_test_bot in Telegram and send any message, like "hi".'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'To use a group, add @agentlite_test_bot there and send a message that mentions it, like "@agentlite_test_bot hi".',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Open bot$/i }));
    expect(duneDesktop.openExternal).toHaveBeenCalledWith('https://t.me/agentlite_test_bot');

    await user.click(screen.getByRole('button', { name: /Copy @agentlite_test_bot/i }));
    expect(duneDesktop.copyText).toHaveBeenCalledWith('@agentlite_test_bot');
    expect(await screen.findByText('Copied @agentlite_test_bot.')).toBeInTheDocument();
  });

  it('falls back to navigator clipboard when the desktop copy bridge fails', async () => {
    const user = userEvent.setup();
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [],
        errorMessage: null,
        status: 'connected',
      },
    };
    const duneDesktop = renderChannelsSettings({
      externalChannels,
      storedToken: 'bot-token',
    });
    const clipboardWriteText = vi.fn(async () => undefined);
    const originalClipboard = navigator.clipboard;

    duneDesktop.copyText = vi.fn(async () => {
      throw new Error('Desktop clipboard unavailable');
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });

    await user.click(await screen.findByRole('button', { name: /Copy @agentlite_test_bot/i }));

    expect(duneDesktop.copyText).toHaveBeenCalledWith('@agentlite_test_bot');
    expect(clipboardWriteText).toHaveBeenCalledWith('@agentlite_test_bot');
    expect(await screen.findByText('Copied @agentlite_test_bot.')).toBeInTheDocument();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('reports whether refresh found chats or still needs a Telegram message', async () => {
    const user = userEvent.setup();
    const externalChannels: ExternalChannelsState = {
      telegram: {
        botUsername: 'agentlite_test_bot',
        configured: true,
        discoveredChats: [],
        errorMessage: null,
        status: 'connected',
      },
    };
    const runtimeSnapshot = vi
      .fn<() => Promise<AgentServiceSnapshot>>()
      .mockResolvedValueOnce(createRuntimeSnapshot(externalChannels))
      .mockResolvedValueOnce(createRuntimeSnapshot(externalChannels))
      .mockResolvedValueOnce(
        createRuntimeSnapshot({
          telegram: {
            ...externalChannels.telegram,
            discoveredChats: [
              {
                channelId: 'telegram',
                jid: 'tg:123',
                kind: 'dm',
                lastSeenAt: 1,
                name: 'Alice',
              },
            ],
          },
        }),
      );
    const duneDesktop = createDesktopBridge({
      runtimeSnapshot: createRuntimeSnapshot(externalChannels),
      storedToken: 'bot-token',
    });

    duneDesktop.getRuntimeSnapshot = runtimeSnapshot;
    window.duneDesktop = duneDesktop;

    render(
      <ChannelsSettings
        agents={[]}
        externalChannels={externalChannels}
        onThemeChange={vi.fn()}
        runtimeInfo={{ mode: 'real', status: 'ready' }}
        themePreference="system"
      />,
    );

    await user.click(await screen.findByRole('button', { name: /Refresh chats/i }));
    expect(
      await screen.findByText(
        'No chats found yet. Message @agentlite_test_bot in Telegram, then try again.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Refresh chats/i }));
    expect(await screen.findByText('Found 1 Telegram chat(s).')).toBeInTheDocument();
  });

  it('keeps refresh available even when the rendered Telegram state is stale', async () => {
    renderChannelsSettings({
      externalChannels: createDefaultExternalChannelsState(),
      runtimeSnapshot: createRuntimeSnapshot({
        telegram: {
          botUsername: 'agentlite_test_bot',
          configured: true,
          discoveredChats: [],
          errorMessage: null,
          status: 'connected',
        },
      }),
      storedToken: 'bot-token',
    });

    expect(await screen.findByRole('button', { name: /Refresh chats/i })).toBeEnabled();
  });
});
