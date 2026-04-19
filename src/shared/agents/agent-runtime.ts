// Shared agent runtime contracts.

import type {
  Agent,
  AgentTranscriptPage,
  AgentDefinition,
  AgentRuntimeInfo,
  CodingEngineStatus,
  CreateAgentInput,
  ExternalChannelsState,
  RunIsolatedResearchInput,
  RunIsolatedResearchResult,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
/**
 * The full read-model of the agent runtime. Whatever process owns the
 * canonical state (today: the desktop main process) computes this and
 * fans it out to every subscriber.
 */
export interface AgentServiceSnapshot {
  agents: Agent[];
  codingEngines: CodingEngineStatus[];
  externalChannels: ExternalChannelsState;
  isStreaming: boolean;
  runtimeInfo: AgentRuntimeInfo;
  selectedAgentId: string | null;
  telegramSetupSessions: TelegramSetupSession[];
}

/** Agent service listener shape. */
export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

/**
 * The set of operations the runtime exposes to callers. Both the real
 * main-process implementation and the renderer-side bridge that proxies
 * to it satisfy this contract.
 */
export interface AgentService {
  cancelTelegramSetupSession: (sessionId: string) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  ensureProjectMainAgent: (
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) => Promise<string>;
  getTranscriptPage: (
    agentId: string,
    options?: { beforeMessageId?: string | null; limit?: number },
  ) => Promise<AgentTranscriptPage>;
  getTelegramSetupSession: (sessionId: string) => Promise<TelegramSetupSession | null>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  runIsolatedResearch: (
    agentId: string,
    input: RunIsolatedResearchInput,
  ) => Promise<RunIsolatedResearchResult>;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  scheduleItemAssignment: (agentId: string, itemId: string) => Promise<string | null>;
  cancelItemAssignment: (agentId: string, taskId: string) => Promise<void>;
  isItemTaskKnown: (agentId: string, taskId: string) => boolean;
  startTelegramSetupSession: (input: StartTelegramSetupSessionInput) => Promise<string>;
  subscribe: (listener: AgentServiceListener) => () => void;
  updateAgentChannel: (input: UpdateAgentChannelInput) => Promise<void>;
  updateAgentDefinition: (
    agentId: string,
    definition: AgentDefinition,
  ) => Promise<void>;
  postSystemMessage: (agentId: string, body: string) => Promise<void>;
}

/**
 * Top-level contract that wraps an AgentService with snapshot access
 * and reset semantics. Multiple implementations satisfy this contract:
 *   - The real main-process AgentRuntime class
 *   - The mock used by tests and during boot fallback
 *   - The renderer-side bridge that proxies to the real runtime via IPC
 *
 * The contract is named "Contract" rather than just "AgentRuntime" so
 * the canonical real-world implementation can use the unsuffixed name.
 */
export interface AgentRuntimeContract {
  getSnapshot: () => AgentServiceSnapshot;
  reset: () => void;
  service: AgentService;
  subscribe: (listener: AgentServiceListener) => () => void;
}
