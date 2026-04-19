// Agent activity helper tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { AgentActivityStatus } from '@/shared/agents/agent-activity';

import {
  readAgentActivityStatus,
  resolveAgentActivityStatusPath,
  summarizeAgentActivityArgs,
  writeAgentActivityStatus,
} from './agent-activity';

const tempDirs: string[] = [];

function createTempDataDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-agent-activity-'));

  tempDirs.push(tempDir);
  return tempDir;
}

function createStatus(
  overrides: Partial<AgentActivityStatus> = {},
): AgentActivityStatus {
  return {
    agentId: 'agent-1',
    agentName: 'Observer',
    currentTool: null,
    lastToolDurationMs: null,
    phase: 'idle',
    schemaVersion: 1,
    sessionId: 'session-1',
    sessionStartedAt: '2026-04-19T00:00:00.000Z',
    status: 'idle',
    toolArgsSummary: null,
    turnCount: 0,
    updatedAt: '2026-04-19T00:00:01.000Z',
    workItemId: null,
    workItemTitle: null,
    ...overrides,
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('agent activity helpers', () => {
  it('summarizes known tool payloads', () => {
    expect(
      summarizeAgentActivityArgs('Read', JSON.stringify({ file_path: '/tmp/readme.md' })),
    ).toBe('/tmp/readme.md');
    expect(
      summarizeAgentActivityArgs('Bash', { command: 'npm run build -- --watch=false' }),
    ).toBe('npm run build -- --watch=false');
    expect(
      summarizeAgentActivityArgs('call_action', { name: 'runtime.get_snapshot' }),
    ).toBe('runtime.get_snapshot');
  });

  it('falls back to a trimmed string summary for generic payloads', () => {
    const summary = summarizeAgentActivityArgs(
      'WebSearch',
      '   search the latest agent observability docs   ',
    );

    expect(summary).toBe('search the latest agent observability docs');
  });

  it('writes and reads a status file through the shared schema', () => {
    const dataDir = createTempDataDir();
    const status = createStatus({
      currentTool: 'Bash',
      phase: 'tool_call_start',
      status: 'working',
      toolArgsSummary: 'pnpm typecheck',
      turnCount: 3,
    });

    writeAgentActivityStatus(dataDir, status);

    expect(fs.existsSync(resolveAgentActivityStatusPath(dataDir))).toBe(true);
    expect(readAgentActivityStatus(dataDir)).toEqual(status);
  });

  it('returns null for malformed status payloads', () => {
    const dataDir = createTempDataDir();

    fs.mkdirSync(path.join(dataDir, 'ipc'), { recursive: true });
    fs.writeFileSync(
      resolveAgentActivityStatusPath(dataDir),
      JSON.stringify({ schemaVersion: 1, status: 'working' }),
    );

    expect(readAgentActivityStatus(dataDir)).toBeNull();
  });
});
