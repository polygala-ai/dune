import type {
  Agent,
  ExternalChannelsState,
  AgentRuntimeInfo,
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';

export interface AgentServiceSnapshot {
  agents: Agent[];
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
  telegramSetupSessions: TelegramSetupSession[];
}

export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

export interface AgentService {
  cancelTelegramSetupSession: (sessionId: string) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  ensureProjectMainAgent: (projectId: string, projectName: string) => Promise<string>;
  getTelegramSetupSession: (sessionId: string) => Promise<TelegramSetupSession | null>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  startTelegramSetupSession: (input: StartTelegramSetupSessionInput) => Promise<string>;
  subscribe: (listener: AgentServiceListener) => () => void;
}
