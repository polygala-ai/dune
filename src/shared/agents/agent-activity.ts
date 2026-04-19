// Shared real-time agent activity types.

export interface AgentActivityStatus {
  schemaVersion: 1;
  updatedAt: string;
  agentId: string;
  agentName: string;
  status: 'working' | 'idle' | 'done' | 'error';
  phase: 'tool_call_start' | 'tool_call_done' | 'idle' | 'done' | 'error';
  currentTool: string | null;
  toolArgsSummary: string | null;
  lastToolDurationMs: number | null;
  turnCount: number;
  workItemId: string | null;
  workItemTitle: string | null;
  sessionId: string;
  sessionStartedAt: string;
}

export interface AgentActivityEntry {
  agentId: string;
  agentName: string;
  status: AgentActivityStatus | null;
  isAlive: boolean;
}

export interface AgentActivitySnapshot {
  agents: AgentActivityEntry[];
}

export interface AgentActivityUpdatePayload extends AgentActivityEntry {}
