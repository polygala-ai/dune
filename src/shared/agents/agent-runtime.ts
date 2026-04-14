// Shared agent runtime contracts.

import type {
  Agent,
  AgentRuntimeInfo,
  CodingEngineStatus,
  CreateAgentInput,
  ExternalChannelsState,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { ReadyAssignmentsInboxSignal } from '@/shared/agents/ready-assignments';

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
