import type {
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelKind,
  AgentChannelStatus,
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

export function getChannelOption(channelId: AgentChannelId): AgentChannelOption {
  return channelCatalog[channelId];
}

export function formatChannelStatus(status: AgentChannelStatus) {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'coming-soon':
      return 'Coming soon';
    default:
      return 'Ready';
  }
}

export function createChannelBinding(channelId: AgentChannelId): AgentChannelBinding {
  const channel = getChannelOption(channelId);

  return {
    canCompose: channel.kind === 'built-in',
    id: channel.id,
    kind: channel.kind,
    label: channel.label,
    status: channel.kind === 'built-in' ? 'ready' : 'connected',
  };
}
