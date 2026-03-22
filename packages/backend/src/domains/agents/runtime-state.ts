import { SimpleBox } from '@boxlite-ai/boxlite'
import * as agentStore from '../../storage/agent-store.js'
import * as agentLogStore from '../../storage/agent-log-store.js'
import { emit } from '../../gateway/events.js'
import { createBoxliteRuntime } from '../../boxlite/runtime.js'
import { newEventId } from '../../utils/ids.js'
import { timedExec } from './container-exec.js'
import {
  THINKING_WATCHDOG_MS,
} from './constants.js'
import type { AgentLogEntry, AgentStatusType } from '@dune/shared'
import type { RunningAgent, RuntimeLogChannel } from './constants.js'

// ── Shared mutable state ────────────────────────────────────────────────

export const runningAgents = new Map<string, RunningAgent>()

export function __setRunningAgentForTests(agentId: string, running: RunningAgent | null): void {
  if (running) {
    runningAgents.set(agentId, running)
  } else {
    runningAgents.delete(agentId)
  }
}

/** Per-agent lock to prevent concurrent sendMessage calls (orchestrator push + daemon poll overlap) */
export const agentLocks = new Map<string, Promise<string>>()

// ── BoxLite runtime ─────────────────────────────────────────────────────

let runtime: any = null

export function getRuntime() {
  if (!runtime) {
    runtime = createBoxliteRuntime()
  }
  return runtime
}

export function closeRuntime() {
  if (runtime) {
    runtime.close()
    runtime = null
  }
}

export function __setRuntimeForTests(nextRuntime: any | null): void {
  runtime = nextRuntime
}

// ── Thinking watchdog ───────────────────────────────────────────────────

/** Watchdog: recovers agents stuck in "thinking" state beyond timeout. */
const thinkingWatchdogTimer = setInterval(() => {
  const now = Date.now()
  for (const [agentId, running] of runningAgents) {
    if (running.execution.thinkingSince > 0 && (now - running.execution.thinkingSince) > THINKING_WATCHDOG_MS) {
      console.warn(`[watchdog] Agent ${agentId} stuck in thinking for ${Math.round((now - running.execution.thinkingSince) / 1000)}s — resetting to error`)
      running.execution.thinkingSince = 0
      setAgentStatus(agentId, 'error', { source: 'thinking-watchdog', reason: 'thinking timeout exceeded' })
      // Try to clean up busy flag
      timedExec(running.box, 'rm', ['-f', '/tmp/agent-busy'], { DISPLAY: ':1' }, 10_000).catch(() => {})
    }
  }
}, 30_000)  // check every 30s
thinkingWatchdogTimer.unref()

// ── Status transition validation ─────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  stopped: ['starting'],
  starting: ['idle', 'error', 'stopped'],
  idle: ['thinking', 'stopping', 'stopped', 'error'],
  thinking: ['responding', 'idle', 'error', 'stopped'],
  responding: ['idle', 'error', 'stopped'],
  stopping: ['stopped'],
  error: ['idle', 'stopped', 'starting'],
}

// ── Status + logging helpers ────────────────────────────────────────────

export function isAgentRunning(agentId: string): boolean {
  return runningAgents.has(agentId)
}

export function setAgentStatus(
  agentId: string,
  status: AgentStatusType,
  options: {
    broadcast?: boolean
    reason?: string
    source?: string
    logRuntime?: boolean
  } = {},
): void {
  const shouldBroadcast = options.broadcast ?? true
  const shouldLogRuntime = options.logRuntime ?? true

  // Validate status transition
  const currentAgent = agentStore.getAgent(agentId)
  if (currentAgent) {
    const currentStatus = currentAgent.status
    const allowed = VALID_TRANSITIONS[currentStatus]
    if (allowed && !allowed.includes(status)) {
      console.warn(`[status] Invalid transition for agent ${agentId}: ${currentStatus} → ${status} (source: ${options.source ?? 'unknown'})`)
    }
  }

  agentStore.updateAgentStatus(agentId, status)
  if (shouldBroadcast) {
    emit({ type: 'agent:status', payload: { agentId, status } })
  }
  if (shouldLogRuntime) {
    const message = options.reason ? `${status} (${options.reason})` : status
    emitRuntimeLog(agentId, 'status', message, {
      status,
      reason: options.reason ?? null,
      source: options.source ?? 'agent-manager',
    })
  }
}

export function emitAgentLogEntries(agentId: string, entries: AgentLogEntry[]): void {
  if (entries.length === 0) return
  agentLogStore.addAgentLogs(agentId, entries)
  emit({ type: 'agent:log', payload: { agentId, entries } })
}

export function emitRuntimeLog(
  agentId: string,
  channel: RuntimeLogChannel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  const entry: AgentLogEntry = {
    id: newEventId(),
    agentId,
    timestamp: Date.now(),
    type: 'runtime',
    data: {
      channel,
      message,
      ...metadata,
    },
  }
  emitAgentLogEntries(agentId, [entry])
}

/** Emit a system log entry during startup (shows in DM chat view). */
export function emitStartupLog(agentId: string, message: string) {
  const entry: AgentLogEntry = {
    id: newEventId(),
    agentId,
    timestamp: Date.now(),
    type: 'system',
    data: { message },
  }
  emitAgentLogEntries(agentId, [entry])
}
