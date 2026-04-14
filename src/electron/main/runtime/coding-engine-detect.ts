// Coding engine detection helpers.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CodingEngineId, CodingEngineStatus } from '@/renderer/features/agents/types';

const execFileAsync = promisify(execFile);
const DETECT_TIMEOUT_MS = 5_000;

/** Parses version. */
function parseVersion(stdout: string): string | null {
  const match = stdout.match(/\d+\.\d+[\w.-]*/);
  return match ? match[0] : null;
}

/** Detects engine. */
async function detectEngine(
  id: CodingEngineId,
  label: string,
  command: string,
  versionArgs: string[],
): Promise<CodingEngineStatus> {
  try {
    const { stdout } = await execFileAsync(command, versionArgs, {
      timeout: DETECT_TIMEOUT_MS,
    });
    return { id, label, available: true, version: parseVersion(stdout) };
  } catch {
    return { id, label, available: false, version: null };
  }
}

/** Detects coding engines. */
export async function detectCodingEngines(): Promise<CodingEngineStatus[]> {
  return Promise.all([
    detectEngine('claude-code', 'Claude Code', 'claude', ['--version']),
    detectEngine('codex', 'Codex', 'codex', ['--version']),
  ]);
}
