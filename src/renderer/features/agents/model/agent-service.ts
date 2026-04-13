import type {
  Agent,
  CodingEngineStatus,
  ExternalChannelsState,
  AgentRuntimeInfo,
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';

export interface AgentServiceSnapshot {
  agents: Agent[];
  codingEngines: CodingEngineStatus[];
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
  ensureProjectMainAgent: (
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) => Promise<string>;
  getTelegramSetupSession: (sessionId: string) => Promise<TelegramSetupSession | null>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  signalReadyAssignmentInbox: (
    agentId: string,
    signal: ReadyAssignmentsInboxSignal,
  ) => Promise<void>;
  startTelegramSetupSession: (input: StartTelegramSetupSessionInput) => Promise<string>;
  subscribe: (listener: AgentServiceListener) => () => void;
  updateAgentChannel: (input: UpdateAgentChannelInput) => Promise<void>;
}
