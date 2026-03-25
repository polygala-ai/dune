export type MessageRole = 'assistant' | 'system' | 'user';
export type MessageStatus = 'complete' | 'streaming';
export type AgentStatus = 'draft' | 'live' | 'ready';

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
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
  note: string;
  status: AgentStatus;
  updatedAt: number;
  workspace: string;
  contextCards: AgentContextCard[];
  messages: AgentMessage[];
}

export interface PresentedAgent extends AgentSummary {
  id: string;
  note: string;
  status: AgentStatus;
  updatedAt: number;
  workspace: string;
  contextCards: AgentContextCard[];
  messages: PresentedAgentMessage[];
}

