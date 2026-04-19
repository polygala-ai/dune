// Agent activity status-file helpers.

import fs from 'node:fs';
import path from 'node:path';

import type { Agent } from '@/renderer/features/agents/types';
import type {
  AgentActivityEntry,
  AgentActivityStatus,
} from '@/shared/agents/agent-activity';

export interface AgentActivityWatchTarget {
  agentId: string;
  dataDir: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function truncateSummary(value: string, maxLength: number = 160): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, maxLength - 3)}...`;
}

function summarizeRecordField(
  payload: Record<string, unknown>,
  fieldNames: string[],
): string | null {
  for (const fieldName of fieldNames) {
    const value = payload[fieldName];

    if (typeof value === 'string' && value.trim()) {
      return truncateSummary(value);
    }
  }

  return null;
}

function summarizeToolRecord(
  toolName: string,
  payload: Record<string, unknown>,
): string | null {
  switch (toolName) {
    case 'Read':
    case 'Write':
      return summarizeRecordField(payload, ['file_path', 'filePath']) ?? toolName;
    case 'Bash':
      return summarizeRecordField(payload, ['command', 'cmd']) ?? toolName;
    case 'call_action':
      return summarizeRecordField(payload, ['name', 'action']) ?? toolName;
    default: {
      const serializedPayload = truncateSummary(JSON.stringify(payload));
      return serializedPayload || toolName;
    }
  }
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStatus(
  value: unknown,
): AgentActivityStatus['status'] | null {
  switch (value) {
    case 'working':
    case 'idle':
    case 'done':
    case 'error':
      return value;
    default:
      return null;
  }
}

function asPhase(
  value: unknown,
): AgentActivityStatus['phase'] | null {
  switch (value) {
    case 'tool_call_start':
    case 'tool_call_done':
    case 'idle':
    case 'done':
    case 'error':
      return value;
    default:
      return null;
  }
}

function asTurnCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function resolveAgentActivityDataDir(runtimeRoot: string, groupFolder: string): string {
  return path.join(runtimeRoot, 'agents', groupFolder, 'data');
}

export function resolveAgentActivityStatusPath(dataDir: string): string {
  return path.join(dataDir, 'ipc', 'status.json');
}

export function summarizeAgentActivityArgs(toolName: string, payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();

    if (!trimmedPayload) {
      return toolName;
    }

    try {
      const parsedPayload = JSON.parse(trimmedPayload) as unknown;
      const recordPayload = asRecord(parsedPayload);

      if (recordPayload) {
        return summarizeToolRecord(toolName, recordPayload);
      }
    } catch {
      return truncateSummary(trimmedPayload);
    }

    return truncateSummary(trimmedPayload);
  }

  const recordPayload = asRecord(payload);

  if (recordPayload) {
    return summarizeToolRecord(toolName, recordPayload);
  }

  return toolName;
}

export function writeAgentActivityStatus(
  dataDir: string,
  status: AgentActivityStatus,
): void {
  const ipcDir = path.join(dataDir, 'ipc');
  const statusPath = resolveAgentActivityStatusPath(dataDir);
  const tempPath = path.join(ipcDir, 'status.json.tmp');

  fs.mkdirSync(ipcDir, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(status));
  fs.renameSync(tempPath, statusPath);
}

export function readAgentActivityStatus(dataDir: string): AgentActivityStatus | null {
  const statusPath = resolveAgentActivityStatusPath(dataDir);

  try {
    const raw = fs.readFileSync(statusPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const status = asStatus(parsed.status);
    const phase = asPhase(parsed.phase);

    if (
      parsed.schemaVersion !== 1
      || !isIsoTimestamp(parsed.updatedAt)
      || typeof parsed.agentId !== 'string'
      || typeof parsed.agentName !== 'string'
      || status === null
      || phase === null
      || typeof parsed.sessionId !== 'string'
      || !isIsoTimestamp(parsed.sessionStartedAt)
    ) {
      return null;
    }

    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt,
      agentId: parsed.agentId,
      agentName: parsed.agentName,
      status,
      phase,
      currentTool: asNullableString(parsed.currentTool),
      toolArgsSummary: asNullableString(parsed.toolArgsSummary),
      lastToolDurationMs: asNullableNumber(parsed.lastToolDurationMs),
      turnCount: asTurnCount(parsed.turnCount),
      workItemId: asNullableString(parsed.workItemId),
      workItemTitle: asNullableString(parsed.workItemTitle),
      sessionId: parsed.sessionId,
      sessionStartedAt: parsed.sessionStartedAt,
    };
  } catch {
    return null;
  }
}

export function createAgentActivityEntry(
  agent: Pick<Agent, 'id' | 'name'>,
  isAlive: boolean,
  status: AgentActivityStatus | null,
  workItemTitle: string | null,
): AgentActivityEntry {
  return {
    agentId: agent.id,
    agentName: agent.name,
    isAlive,
    status: status
      ? {
          ...status,
          agentId: agent.id,
          agentName: agent.name,
          workItemTitle: workItemTitle ?? status.workItemTitle,
        }
      : null,
  };
}

function activitySortWeight(activity: AgentActivityEntry): number {
  const status = activity.status?.status;

  switch (status) {
    case 'working':
      return 0;
    case 'error':
      return 1;
    case 'idle':
      return 2;
    case 'done':
      return 3;
    default:
      return activity.isAlive ? 4 : 1;
  }
}

export function compareAgentActivityRecords(
  left: AgentActivityEntry,
  right: AgentActivityEntry,
): number {
  const weightDifference = activitySortWeight(left) - activitySortWeight(right);

  if (weightDifference !== 0) {
    return weightDifference;
  }

  const leftUpdatedAt = left.status ? Date.parse(left.status.updatedAt) : 0;
  const rightUpdatedAt = right.status ? Date.parse(right.status.updatedAt) : 0;
  const updatedAtDifference = rightUpdatedAt - leftUpdatedAt;

  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  return left.agentName.localeCompare(right.agentName);
}
