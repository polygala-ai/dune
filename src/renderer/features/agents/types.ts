export type MessageRole = 'assistant' | 'system' | 'user';
export type MessageStatus = 'complete' | 'streaming';
export type MessageFormat = 'markdown' | 'plain';
export type AgentStatus = 'draft' | 'live' | 'ready';
export type AgentRole = 'custom' | 'project-main';
export type AgentChannelId = 'discord' | 'dune-chat' | 'slack' | 'telegram';
export type ExternalChannelId = Exclude<AgentChannelId, 'dune-chat'>;
export type AgentChannelKind = 'built-in' | 'external';
export type AgentChannelStatus =
  | 'coming-soon'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'ready';
export type AgentRuntimeMode = 'mock-fallback' | 'real';
export type AgentRuntimeStatus = 'error' | 'ready' | 'starting';
export type ExternalChatKind = 'dm' | 'group';
export type TelegramConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'not-configured';
export type TelegramPairingStatus =
  | 'expired'
  | 'idle'
  | 'listening'
  | 'matched';

export interface AgentExternalTarget {
  channelId: ExternalChannelId;
  jid: string;
  kind: ExternalChatKind;
  name: string;
}

export interface DiscoveredExternalChat extends AgentExternalTarget {
  lastSeenAt: number;
}

export interface TelegramAgentRuntimeState {
  botUsername: string | null;
  boundChat: AgentExternalTarget | null;
  errorMessage: string | null;
  pairCode: string | null;
  pairExpiresAt: number | null;
  pairingStatus: TelegramPairingStatus;
  status: TelegramConnectionStatus;
}

export interface TelegramSetupSession {
  agentId: string | null;
  botUsername: string | null;
  errorMessage: string | null;
  id: string;
  matchedChat: AgentExternalTarget | null;
  pairCode: string | null;
  pairExpiresAt: number | null;
  pairingStatus: TelegramPairingStatus;
  status: TelegramConnectionStatus;
}

export type ExternalChannelsState = Record<string, never>;

export interface AgentRuntimeInfo {
  mode: AgentRuntimeMode;
  status: AgentRuntimeStatus;
  message?: string;
  rootPath?: string;
}

export interface AgentChannelBinding {
  id: AgentChannelId;
  kind: AgentChannelKind;
  label: string;
  status: AgentChannelStatus;
  canCompose: boolean;
  target?: AgentExternalTarget | null;
}

export interface CreateAgentInput {
  channelId: AgentChannelId;
  externalTarget?: AgentExternalTarget | null;
  model?: { providerId: string; modelId: string };
  name: string;
  projectId?: string | null;
  telegramSetupSessionId?: string | null;
}

export interface StartTelegramSetupSessionInput {
  agentId?: string | null;
  token?: string | null;
}

export interface AgentAttachment {
  caption?: string;
  kind: 'audio' | 'file' | 'image' | 'video';
  mimeType?: string;
  name: string;
  sizeBytes?: number;
  url: string;
}

export interface AgentMessage {
  attachments: AgentAttachment[];
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  format: MessageFormat;
  status: MessageStatus;
}

export interface AgentContextCard {
  id: string;
  title: string;
  eyebrow: string;
  body: string;
}

export interface PresentedAgentMessage extends AgentMessage {
  createdAtLabel: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  preview: string;
  updatedLabel: string;
  statusLabel: string;
}

export interface Agent extends Pick<AgentSummary, 'id' | 'name' | 'preview'> {
  channel: AgentChannelBinding;
  note: string;
  projectId: string | null;
  role: AgentRole;
  status: AgentStatus;
  telegram: TelegramAgentRuntimeState | null;
  updatedAt: number;
  workspace: string;
  contextCards: AgentContextCard[];
  messages: AgentMessage[];
}

export interface PresentedAgent extends AgentSummary {
  channel: AgentChannelBinding;
  id: string;
  note: string;
  projectId: string | null;
  role: AgentRole;
  status: AgentStatus;
  telegram: TelegramAgentRuntimeState | null;
  updatedAt: number;
  workspace: string;
  contextCards: AgentContextCard[];
  messages: PresentedAgentMessage[];
}
