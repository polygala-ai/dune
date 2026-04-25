// Shared agent activity status payloads.

export interface AgentToolResult {
  toolName: string | null;
  preview: string;
  isError?: boolean;
}

export interface AgentActivityStatus {
  schemaVersion: 1;
  updatedAt: string;
  agentId: string;
  agentName: string;
  status: 'idle' | 'thinking' | 'tool-calling' | 'waiting' | 'done' | 'error';
  phase: 'tool_call_start' | 'tool_call_done' | 'idle' | 'done' | 'error';
  currentTool: string | null;
  toolArgsSummary: string | null;
  lastToolResultSummary: string | null;
  lastToolDurationMs: number | null;
  lastToolResult: AgentToolResult | null;
  turnCount: number;
  currentTaskId: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  sessionId: string;
  sessionStartedAt: string;
}
