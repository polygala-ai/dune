import type {
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelKind,
  AgentChannelStatus,
  AgentExternalTarget,
  ExternalChannelsState,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';

export interface AgentChannelOption {
  description: string;
  id: AgentChannelId;
  kind: AgentChannelKind;
  label: string;
}

const channelCatalog: Record<AgentChannelId, AgentChannelOption> = {
  'discord': {
    description: 'Mirror a Discord thread into Dune.',
    id: 'discord',
    kind: 'external',
    label: 'Discord',
  },
  'dune-chat': {
    description: 'Built in and writable inside Dune.',
    id: 'dune-chat',
    kind: 'built-in',
    label: 'Dune chat',
  },
  'slack': {
    description: 'Mirror a Slack channel into Dune.',
    id: 'slack',
    kind: 'external',
    label: 'Slack',
  },
  'telegram': {
    description: 'Mirror a Telegram chat into Dune.',
    id: 'telegram',
    kind: 'external',
    label: 'Telegram',
  },
};

export const builtInChannelOption = channelCatalog['dune-chat'];

export const externalChannelOptions = [
  channelCatalog.telegram,
  channelCatalog.slack,
  channelCatalog.discord,
];

export const createAgentChannelOptions = [
  builtInChannelOption,
  ...externalChannelOptions,
];

export function createDefaultExternalChannelsState(): ExternalChannelsState {
  return {};
}

export function cloneExternalChannelsState(
  state: ExternalChannelsState,
): ExternalChannelsState {
  return { ...state };
}

export function createDefaultTelegramAgentRuntimeState(
  overrides: Partial<TelegramAgentRuntimeState> = {},
): TelegramAgentRuntimeState {
  return {
    botUsername: null,
    boundChat: null,
    errorMessage: null,
    pairCode: null,
    pairExpiresAt: null,
    pairingStatus: 'idle',
    status: 'disconnected',
    ...overrides,
  };
}

export function cloneTelegramAgentRuntimeState(
  state: TelegramAgentRuntimeState | null | undefined,
): TelegramAgentRuntimeState | null {
  if (!state) {
    return null;
  }

  return {
    ...state,
    boundChat: state.boundChat ? { ...state.boundChat } : null,
  };
}

export function cloneTelegramSetupSession(
  session: TelegramSetupSession,
): TelegramSetupSession {
  return {
    ...session,
    matchedChat: session.matchedChat ? { ...session.matchedChat } : null,
  };
}

export function getChannelOption(channelId: AgentChannelId): AgentChannelOption {
  return channelCatalog[channelId];
}

export function formatChannelStatus(status: AgentChannelStatus) {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    case 'coming-soon':
      return 'Coming soon';
    default:
      return 'Ready';
  }
}

function mapTelegramChannelStatus(
  status: TelegramConnectionStatus,
): AgentChannelStatus {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'error':
      return 'error';
    case 'disconnected':
    case 'not-configured':
      return 'disconnected';
    default:
      return 'disconnected';
  }
}

export function createChannelBinding(
  channelId: AgentChannelId,
  options: {
    telegram?: TelegramAgentRuntimeState | null;
    target?: AgentExternalTarget | null;
  } = {},
): AgentChannelBinding {
  const channel = getChannelOption(channelId);
  const target = options.target ?? null;

  return {
    canCompose: channel.kind === 'built-in',
    id: channel.id,
    kind: channel.kind,
    label: channel.label,
    status:
      channel.id === 'dune-chat'
        ? 'ready'
        : channel.id === 'telegram'
          ? mapTelegramChannelStatus(options.telegram?.status ?? 'disconnected')
          : 'coming-soon',
    ...(target ? { target } : {}),
  };
}
