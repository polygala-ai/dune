// Shared agent activity status payloads.

export interface AgentActivityStatus {
  schemaVersion: 1;
  updatedAt: string;
  agentId: string;
  agentName: string;
  status: 'idle' | 'thinking' | 'tool-calling' | 'waiting' | 'done' | 'error';
  phase: 'tool_call_start' | 'tool_call_done' | 'idle' | 'done' | 'error';
  currentTool: string | null;
  toolArgsSummary: string | null;
  lastToolDurationMs: number | null;
  lastToolResult: string | null;
  turnCount: number;
  workItemId: string | null;
  workItemTitle: string | null;
  sessionId: string;
  sessionStartedAt: string;
}
