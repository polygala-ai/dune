// Shared tool analytics contracts.

/** Aggregated usage row for one AgentLite tool. */
export interface ToolUsageSummaryRow {
  avgDurationMs: number;
  callCount: number;
  successCount: number;
  successRate: number;
  toolName: string;
}

/** Response shape for tool analytics summary queries. */
export interface ToolUsageSummaryResult {
  generatedAt: string;
  rows: ToolUsageSummaryRow[];
  windowHours: number;
}
