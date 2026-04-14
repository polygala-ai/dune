import type {
  AgentChannelBinding,
  AgentChannelId,
  AgentChannelStatus,
  AgentExternalTarget,
  TelegramAgentRuntimeState,
  TelegramConnectionStatus,
} from '@/renderer/features/agents/types';

export function mapTelegramChannelStatus(status: TelegramConnectionStatus): AgentChannelStatus {
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
  telegramState: TelegramAgentRuntimeState | null,
  target: AgentExternalTarget | null = null,
): AgentChannelBinding {
  switch (channelId) {
    case 'discord':
      return {
        canCompose: false,
        id: 'discord',
        kind: 'external',
        label: 'Discord',
        status: 'coming-soon',
      };
    case 'slack':
      return {
        canCompose: false,
        id: 'slack',
        kind: 'external',
        label: 'Slack',
        status: 'coming-soon',
      };
    case 'telegram':
      return {
        canCompose: false,
        id: 'telegram',
        kind: 'external',
        label: 'Telegram',
        status: mapTelegramChannelStatus(telegramState?.status ?? 'disconnected'),
        ...(target ? { target } : {}),
      };
    default:
      return {
        canCompose: true,
        id: 'dune-chat',
        kind: 'built-in',
        label: 'Dune chat',
        status: 'ready',
      };
  }
}
