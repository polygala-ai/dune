// Agent feature types.

/** Message role shape. */
export type MessageRole = 'assistant' | 'system' | 'user';
/** Message status. */
export type MessageStatus = 'complete' | 'streaming';
/** Message format shape. */
export type MessageFormat = 'markdown' | 'plain';
/** Identifier for coding engine. */
export type CodingEngineId = 'claude-code' | 'codex';
/** Coding engine event kind shape. */
export type CodingEngineEventKind = 'completed' | 'error' | 'started' | 'step';
/** Agent activity kind shape. */
export type AgentActivityKind = 'subagent' | 'status' | 'tool';
/** Agent status. */
export type AgentStatus = 'draft' | 'live' | 'ready';
/** Agent role shape. */
export type AgentRole = 'custom' | 'project-main';
/** Identifier for agent channel. */
export type AgentChannelId = 'discord' | 'dune-chat' | 'slack' | 'telegram';
/** Identifier for external channel. */
export type ExternalChannelId = Exclude<AgentChannelId, 'dune-chat'>;
/** Agent channel kind shape. */
export type AgentChannelKind = 'built-in' | 'external';
/** Agent channel status. */
export type AgentChannelStatus =
  | 'coming-soon'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'ready';
/** Agent runtime mode shape. */
export type AgentRuntimeMode = 'mock-fallback' | 'real';
/** Agent runtime status. */
export type AgentRuntimeStatus = 'error' | 'ready' | 'starting';
/** External chat kind shape. */
export type ExternalChatKind = 'dm' | 'group';
/** Telegram connection status. */
export type TelegramConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'not-configured';
/** Telegram pairing status. */
export type TelegramPairingStatus =
  | 'expired'
  | 'idle'
  | 'listening'
  | 'matched';

/** Agent external target shape. */
export interface AgentExternalTarget {
  channelId: ExternalChannelId;
  jid: string;
  kind: ExternalChatKind;
  name: string;
}

/** Discovered external chat shape. */
export interface DiscoveredExternalChat extends AgentExternalTarget {
  lastSeenAt: number;
}

/** Telegram agent runtime state. */
export interface TelegramAgentRuntimeState {
  botUsername: string | null;
  boundChat: AgentExternalTarget | null;
  errorMessage: string | null;
  pairCode: string | null;
  pairExpiresAt: number | null;
  pairingStatus: TelegramPairingStatus;
  status: TelegramConnectionStatus;
}

/** Telegram setup session. */
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

/** External channels state. */
export type ExternalChannelsState = Record<string, never>;

/** Agent runtime info shape. */
export interface AgentRuntimeInfo {
  artifactsPath?: string;
  mode: AgentRuntimeMode;
  status: AgentRuntimeStatus;
  message?: string;
  rootPath?: string;
}

/** Agent channel binding. */
export interface AgentChannelBinding {
  id: AgentChannelId;
  kind: AgentChannelKind;
  label: string;
  status: AgentChannelStatus;
  canCompose: boolean;
  target?: AgentExternalTarget | null;
}

/** Create agent input shape. */
export interface CreateAgentInput {
  channelId: AgentChannelId;
  externalTarget?: AgentExternalTarget | null;
  model?: { providerId: string; modelId: string };
  name: string;
  projectId?: string | null;
  projectName?: string | null;
  projectRootPath?: string | null;
  telegramSetupSessionId?: string | null;
}

/** Update agent channel input shape. */
export interface UpdateAgentChannelInput {
  agentId: string;
  channelId: AgentChannelId;
  telegramSetupSessionId?: string | null;
}

/** Start Telegram setup session input shape. */
export interface StartTelegramSetupSessionInput {
  agentId?: string | null;
  token?: string | null;
}

/** Agent attachment shape. */
export interface AgentAttachment {
  caption?: string;
  kind: 'audio' | 'file' | 'image' | 'video';
  mimeType?: string;
  name: string;
  sizeBytes?: number;
  url: string;
}

/** Agent message shape. */
export interface AgentMessage {
  attachments: AgentAttachment[];
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  format: MessageFormat;
  status: MessageStatus;
}

/** Agent activity event shape. */
export interface AgentActivityEvent {
  id: string;
  kind: AgentActivityKind;
  label: string;
  detail?: string | undefined;
  timestamp: number;
}

/** Agent context card shape. */
export interface AgentContextCard {
  id: string;
  title: string;
  eyebrow: string;
  body: string;
}

/** Presented agent message shape. */
export interface PresentedAgentMessage extends AgentMessage {
  createdAtLabel: string;
}

/** Agent summary shape. */
export interface AgentSummary {
  id: string;
  name: string;
  preview: string;
  updatedLabel: string;
  statusLabel: string;
}

/** Agent shape. */
export interface Agent extends Pick<AgentSummary, 'id' | 'name' | 'preview'> {
  activityEvents: AgentActivityEvent[];
  channel: AgentChannelBinding;
  codingEngineEvents: CodingEngineEvent[];
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

/** Presented agent shape. */
export interface PresentedAgent extends AgentSummary {
  activityEvents: AgentActivityEvent[];
  channel: AgentChannelBinding;
  codingEngineEvents: CodingEngineEvent[];
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

/** Coding engine status. */
export interface CodingEngineStatus {
  id: CodingEngineId;
  label: string;
  available: boolean;
  version: string | null;
}

/** Coding engine event shape. */
export interface CodingEngineEvent {
  id: string;
  engineId: CodingEngineId;
  kind: CodingEngineEventKind;
  prompt?: string;
  stepLabel?: string;
  result?: string;
  error?: string;
  timestamp: number;
}
