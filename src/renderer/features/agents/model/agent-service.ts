import type {
  Agent,
  CreateAgentInput,
} from '@/renderer/features/agents/types';

export interface AgentServiceSnapshot {
  agents: Agent[];
  isStreaming: boolean;
  selectedAgentId: string | null;
}

export type AgentServiceListener = (snapshot: AgentServiceSnapshot) => void;

export interface AgentService {
  createAgent: (input: CreateAgentInput) => Promise<string>;
  getSnapshot: () => AgentServiceSnapshot;
  listAgents: () => Agent[];
  selectAgent: (agentId: string) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  subscribe: (listener: AgentServiceListener) => () => void;
}
