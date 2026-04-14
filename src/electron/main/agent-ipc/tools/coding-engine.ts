// Coding engine IPC tool handlers.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { CodingEngineEvent, CodingEngineId } from '@/renderer/features/agents/types';

import { optionalString, requireString } from './helpers';
import { objectSchema, optionalStringSchema, stringSchema } from './schemas';
import { ToolHandlerError, type RegisteredTool, type ToolServices } from './types';

const CODING_ENGINE_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes
const LOG_TAIL_READ_BYTES = 64 * 1024;

/** Coding engine job shape. */
interface CodingEngineJob {
  jobId: string;
  engineId: CodingEngineId;
  status: 'running' | 'completed' | 'error';
  steps: string[];
  logPathHost: string;
  logPathContainer: string;
  errPathContainer: string;
  result?: string;
  error?: string;
  startedAt: number;
}

/** Global registry of running/completed coding engine jobs. */
const engineJobs = new Map<string, CodingEngineJob>();

/** Creates engine event ID. */
function createEngineEventId(): string {
  return `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates job ID. */
function createJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Emits engine event. */
function emitEngineEvent(
  services: ToolServices,
  event: CodingEngineEvent,
) {
  services.onCodingEngineEvent?.(services.agentContext.agentId, event);
}

/** Builds engine command. */
function buildEngineCommand(
  engineId: CodingEngineId,
  prompt: string,
  extraArgs?: string[],
): { command: string; args: string[] } {
  if (engineId === 'claude-code') {
    const baseArgs = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (extraArgs && extraArgs.length > 0) {
      return { command: 'claude', args: [...baseArgs, ...extraArgs] };
    }

    return {
      command: 'claude',
      args: [...baseArgs, '--permission-mode', 'bypassPermissions'],
    };
  }

  const codexBaseArgs = ['exec', prompt, '--json'];

  if (extraArgs && extraArgs.length > 0) {
    return { command: 'codex', args: [...codexBaseArgs, ...extraArgs] };
  }

  return {
    command: 'codex',
    args: [...codexBaseArgs, '--full-auto'],
  };
}

/** Parses streamed steps. */
function parseStreamedSteps(
  engineId: CodingEngineId,
  line: string,
): string | null {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;

    if (engineId === 'claude-code') {
      if (event.type === 'assistant' && typeof event.message === 'object' && event.message !== null) {
        const message = event.message as Record<string, unknown>;
        if (Array.isArray(message.content)) {
          for (const block of message.content) {
            if (typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'tool_use') {
              const toolBlock = block as Record<string, unknown>;
              return `${String(toolBlock.name ?? 'tool')}`;
            }
          }
        }
      }
      if (event.type === 'result') {
        return null;
      }
    }

    if (engineId === 'codex') {
      const type = String(event.type ?? '');
      if (type === 'item.completed' || type.startsWith('item.')) {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === 'function_call') {
          return `${String(item.name ?? 'tool')}`;
        }
      }
    }
  } catch {
    // Not valid JSON, skip
  }

  return null;
}

/** Reads log tail. */
function readLogTail(logPathHost: string, maxBytes: number): string {
  try {
    const stat = fs.statSync(logPathHost);
    const start = stat.size > maxBytes ? stat.size - maxBytes : 0;
    const length = stat.size - start;
    if (length <= 0) return '';
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(logPathHost, 'r');
    try {
      fs.readSync(fd, buffer, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }
    return buffer.toString('utf-8');
  } catch {
    return '';
  }
}

/** Extracts final result. */
function extractFinalResult(
  engineId: CodingEngineId,
  logPathHost: string,
): string {
  const tail = readLogTail(logPathHost, LOG_TAIL_READ_BYTES);
  if (!tail) return 'Completed';

  const lines = tail.trim().split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;

      if (engineId === 'claude-code' && event.type === 'result') {
        return String((event as Record<string, unknown>).result ?? 'Completed');
      }

      if (engineId === 'codex' && event.type === 'turn.completed') {
        return 'Completed';
      }
    } catch {
      // Not JSON
    }
  }

  return lines.filter(Boolean).pop() ?? 'Completed';
}

/** Starts coding engine. */
function startCodingEngine(
  services: ToolServices,
  engineId: CodingEngineId,
  prompt: string,
  extraArgs?: string[],
  cwd?: string,
): { jobId: string; status: 'running'; logPath: string; errPath: string } {
  const snapshot = services.getRuntimeController().getSnapshot();
  const engine = snapshot.codingEngines.find((e) => e.id === engineId);

  if (!engine?.available) {
    const label = engineId === 'claude-code' ? 'Claude Code' : 'Codex';
    throw new ToolHandlerError('unavailable', `${label} is not installed or not found in PATH.`);
  }

  const { command, args } = buildEngineCommand(engineId, prompt, extraArgs);
  const jobId = createJobId();

  const { ipcHostDir, ipcContainerDir } = services.agentContext;
  const logDirHost = path.join(ipcHostDir, 'coding-engines');
  fs.mkdirSync(logDirHost, { recursive: true });

  const logPathHost = path.join(logDirHost, `${jobId}.log`);
  const errPathHost = path.join(logDirHost, `${jobId}.err.log`);
  const logPathContainer = `${ipcContainerDir.replace(/\/$/, '')}/coding-engines/${jobId}.log`;
  const errPathContainer = `${ipcContainerDir.replace(/\/$/, '')}/coding-engines/${jobId}.err.log`;

  const job: CodingEngineJob = {
    jobId,
    engineId,
    status: 'running',
    steps: [],
    logPathHost,
    logPathContainer,
    errPathContainer,
    startedAt: Date.now(),
  };
  engineJobs.set(jobId, job);

  emitEngineEvent(services, {
    id: createEngineEventId(),
    engineId,
    kind: 'started',
    prompt: prompt ?? '',
    timestamp: Date.now(),
  });

  const outStream = fs.createWriteStream(logPathHost);
  const errStream = fs.createWriteStream(errPathHost);
  /** Marks job error. */
  const markJobError = (message: string) => {
    if (job.status !== 'running') return;
    job.status = 'error';
    job.error = message;
    emitEngineEvent(services, {
      id: createEngineEventId(),
      engineId,
      kind: 'error',
      error: message,
      timestamp: Date.now(),
    });
  };
  outStream.on('error', (err) => markJobError(`Log write failed: ${err.message}`));
  errStream.on('error', (err) => markJobError(`Error log write failed: ${err.message}`));

  // Fire and forget — the job runs in the background. `cwd` is passed through
  // as-is; callers inside a container namespace must ensure the path is valid
  // on the host.
  const seenSteps = new Set<string>();
  const child = spawn(command, args, {
    cwd: cwd ?? undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CODING_ENGINE_TIMEOUT_MS,
  });

  child.stdout.pipe(outStream);
  child.stderr.pipe(errStream);

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;

      const stepLabel = parseStreamedSteps(engineId, line);

      if (stepLabel && !seenSteps.has(stepLabel)) {
        seenSteps.add(stepLabel);
        job.steps.push(stepLabel);
        emitEngineEvent(services, {
          id: createEngineEventId(),
          engineId,
          kind: 'step',
          stepLabel,
          timestamp: Date.now(),
        });
      }
    }
  });

  child.on('close', (code) => {
    outStream.end();
    errStream.end();

    if (job.status === 'error') return;

    if (code === 0) {
      const result = extractFinalResult(engineId, logPathHost);
      job.status = 'completed';
      job.result = result;
      emitEngineEvent(services, {
        id: createEngineEventId(),
        engineId,
        kind: 'completed',
        result,
        timestamp: Date.now(),
      });
    } else {
      markJobError(`Process exited with code ${code}`);
    }
  });

  child.on('error', (err) => {
    markJobError(err.message);
  });

  return { jobId, status: 'running', logPath: logPathContainer, errPath: errPathContainer };
}

/** Polls coding engine job. */
function pollCodingEngineJob(jobId: string): {
  status: 'running' | 'completed' | 'error';
  engineId: CodingEngineId;
  logPath: string;
  errPath: string;
  stepCount: number;
  result?: string;
  error?: string;
} {
  const job = engineJobs.get(jobId);
  if (!job) {
    throw new ToolHandlerError('not-found', `Job ${jobId} not found.`);
  }

  const poll: {
    status: 'running' | 'completed' | 'error';
    engineId: CodingEngineId;
    logPath: string;
    errPath: string;
    stepCount: number;
    result?: string;
    error?: string;
  } = {
    status: job.status,
    engineId: job.engineId,
    logPath: job.logPathContainer,
    errPath: job.errPathContainer,
    stepCount: job.steps.length,
  };

  if (job.result !== undefined) poll.result = job.result;
  if (job.error !== undefined) poll.error = job.error;

  return poll;
}

/** Lists coding engine tools. */
export const codingEngineTools: RegisteredTool[] = [
  {
    definition: {
      description: 'Start a coding task with Claude Code (Anthropic). Returns { jobId, status, logPath, errPath } immediately — logPath points at a file this process streams stdout into. Use coding_engine.poll to check status; read logPath with Read/Grep only when you need details. To resume a previous session, pass args: ["--resume", "<session_id>"].',
      inputSchema: objectSchema(
        {
          prompt: { ...stringSchema, description: 'What to ask Claude Code to do' },
          args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI arguments (e.g. ["--model", "sonnet"], ["--resume", "<session_id>"])' },
          cwd: { ...optionalStringSchema, description: 'Working directory for the coding engine process. Affects session storage and file access.' },
        },
        ['prompt'],
      ),
      name: 'coding_engine.claude_code',
    },
    handler: async (services, args) => {
      const extraArgs = Array.isArray(args.args)
        ? (args.args as unknown[]).filter((a): a is string => typeof a === 'string')
        : undefined;
      return startCodingEngine(services, 'claude-code', requireString(args.prompt, 'prompt'), extraArgs, optionalString(args.cwd) ?? undefined);
    },
  },
  {
    definition: {
      description: 'Start a coding task with Codex (OpenAI). Returns { jobId, status, logPath, errPath } immediately. Codex runs in a sandbox with full-auto approval. Use coding_engine.poll to check status; read logPath with Read/Grep only when you need details.',
      inputSchema: objectSchema(
        {
          prompt: { ...stringSchema, description: 'What to ask Codex to do' },
          args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI arguments' },
          cwd: { ...optionalStringSchema, description: 'Working directory for the coding engine process.' },
        },
        ['prompt'],
      ),
      name: 'coding_engine.codex',
    },
    handler: async (services, args) => {
      const extraArgs = Array.isArray(args.args)
        ? (args.args as unknown[]).filter((a): a is string => typeof a === 'string')
        : undefined;
      return startCodingEngine(services, 'codex', requireString(args.prompt, 'prompt'), extraArgs, optionalString(args.cwd) ?? undefined);
    },
  },
  {
    definition: {
      description: 'Poll a running coding engine job. Returns { status, logPath, errPath, stepCount, result?, error? }. The response is intentionally small — no full log is returned. If you need details, use Read or Grep on logPath. On status:"completed" the short `result` summary is usually enough; on "error" check the `error` field and optionally grep errPath. Call this periodically while doing other work.',
      inputSchema: objectSchema(
        { jobId: { ...stringSchema, description: 'The jobId returned by coding_engine.claude_code or coding_engine.codex' } },
        ['jobId'],
      ),
      name: 'coding_engine.poll',
    },
    handler: async (_services, args) => {
      return pollCodingEngineJob(requireString(args.jobId, 'jobId'));
    },
  },
];
