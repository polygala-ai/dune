import { SimpleBox } from '@boxlite-ai/boxlite'
import * as agentStore from '../../storage/agent-store.js'
import * as agentRuntimeStore from '../../storage/agent-runtime-store.js'
import * as sandboxStore from '../../storage/sandbox-store.js'
import {
  RUNTIME_SANDBOX_NAME_PREFIX,
  RUNTIME_SANDBOX_PENDING_PREFIX,
} from './constants.js'
import { runningAgents, isAgentRunning, getRuntime } from './runtime-state.js'

// ── Helpers ─────────────────────────────────────────────────────────────

export function getRuntimeSandboxName(agentId: string): string {
  return `${RUNTIME_SANDBOX_NAME_PREFIX}${agentId}`
}

export function getPendingSandboxId(agentId: string): string {
  return `${RUNTIME_SANDBOX_PENDING_PREFIX}${agentId}`
}

export function isPendingSandboxId(sandboxId: string): boolean {
  return sandboxId.startsWith(RUNTIME_SANDBOX_PENDING_PREFIX)
}

export function canResumePersistedSession(runtimeState: agentRuntimeStore.AgentRuntimeState, sandboxId: string): boolean {
  return runtimeState.hasSession && !isPendingSandboxId(runtimeState.sandboxId) && runtimeState.sandboxId === sandboxId
}

export function isSandboxNotFoundError(err: unknown): boolean {
  const message = String((err as any)?.message || err || '').toLowerCase()
  return (
    message.includes('not found')
    || message.includes('no such')
    || message.includes('does not exist')
    || message.includes('unknown sandbox')
  )
}

export function upsertManagedRuntimeShadow(agentId: string, sandboxId: string, patch: Partial<{
  status: 'running' | 'stopped'
  startedAt: number | null
  stoppedAt: number | null
}> = {}): void {
  if (!sandboxId || isPendingSandboxId(sandboxId)) return

  const agent = agentStore.getAgent(agentId)
  if (!agent) return
  sandboxStore.upsertManagedRuntimeSandbox({
    sandboxId,
    agentId,
    name: `${agent.name} runtime`,
    status: patch.status ?? 'stopped',
    startedAt: patch.startedAt ?? null,
    stoppedAt: patch.stoppedAt ?? null,
    boxliteBoxId: sandboxId,
  })
}

// ── Public API ──────────────────────────────────────────────────────────

// Forward declaration — set by lifecycle.ts to avoid circular imports
let _ensureAgentRunning: ((agentId: string) => Promise<any>) | null = null
let _stopAgent: ((agentId: string) => Promise<void>) | null = null

export function __setLifecycleDeps(deps: {
  ensureAgentRunning: (agentId: string) => Promise<any>
  stopAgent: (agentId: string) => Promise<void>
}): void {
  _ensureAgentRunning = deps.ensureAgentRunning
  _stopAgent = deps.stopAgent
}

export async function resolveAgentIdByRuntimeSandboxId(sandboxId: string): Promise<string | null> {
  if (!sandboxId) return null
  const runtimeStates = agentRuntimeStore.listAgentRuntimeStates(10_000)
  for (const runtimeState of runtimeStates) {
    if (runtimeState.sandboxId === sandboxId) return runtimeState.agentId
  }
  for (const [agentId, running] of runningAgents.entries()) {
    if (running.sandboxId === sandboxId) return agentId
  }
  return null
}

export async function ensureRuntimeSandboxRunning(sandboxId: string): Promise<{ agentId: string; box: SimpleBox }> {
  const agentId = await resolveAgentIdByRuntimeSandboxId(sandboxId)
  if (!agentId) throw new Error('not_found')

  let running = runningAgents.get(agentId)
  if (!running) {
    if (!_ensureAgentRunning) throw new Error('lifecycle deps not initialized')
    await _ensureAgentRunning(agentId)
    running = runningAgents.get(agentId)
  }
  if (!running) throw new Error('failed_to_start')

  if (!running.sandboxId || isPendingSandboxId(running.sandboxId)) {
    try {
      running.sandboxId = await running.box.getId()
    } catch {
      running.sandboxId = sandboxId
    }
  }

  upsertManagedRuntimeShadow(agentId, running.sandboxId, {
    status: 'running',
    startedAt: running.startedAt || Date.now(),
    stoppedAt: null,
  })

  return { agentId, box: running.box }
}

export async function stopRuntimeSandbox(sandboxId: string): Promise<void> {
  const agentId = await resolveAgentIdByRuntimeSandboxId(sandboxId)
  if (!agentId) throw new Error('not_found')
  if (!_stopAgent) throw new Error('lifecycle deps not initialized')
  await _stopAgent(agentId)
}

export async function destroyRuntimeSandbox(sandboxId: string): Promise<void> {
  const agentId = await resolveAgentIdByRuntimeSandboxId(sandboxId)
  if (!agentId) throw new Error('not_found')
  await destroyAgentRuntimeSandbox(agentId)
}

export async function execInRuntimeSandbox(
  sandboxId: string,
  cmd: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { box } = await ensureRuntimeSandboxRunning(sandboxId)
  return box.exec(cmd, args, env)
}

export async function withRuntimeSandboxBox<T>(
  sandboxId: string,
  work: (box: SimpleBox, agentId: string) => Promise<T>,
): Promise<T> {
  const { agentId, box } = await ensureRuntimeSandboxRunning(sandboxId)
  return work(box, agentId)
}

export async function destroyAgentRuntimeSandbox(agentId: string): Promise<void> {
  if (isAgentRunning(agentId)) {
    if (!_stopAgent) throw new Error('lifecycle deps not initialized')
    await _stopAgent(agentId)
  }

  const runtimeState = agentRuntimeStore.getAgentRuntimeState(agentId)
  if (!runtimeState) return

  if (!isPendingSandboxId(runtimeState.sandboxId)) {
    try {
      await getRuntime().remove(runtimeState.sandboxId)
    } catch (err: any) {
      throw new Error(
        `Failed to remove runtime sandbox ${runtimeState.sandboxId} for agent ${agentId}: ${err?.message || 'unknown error'}`,
      )
    }
  }

  if (!isPendingSandboxId(runtimeState.sandboxId)) {
    sandboxStore.deleteManagedRuntimeSandbox(runtimeState.sandboxId)
  } else {
    const managed = sandboxStore.getManagedRuntimeSandboxByAgentId(agentId)
    if (managed) sandboxStore.deleteManagedRuntimeSandbox(managed.id)
  }
  agentRuntimeStore.deleteAgentRuntimeState(agentId)
}

/** Reset a stopped agent runtime so next start always creates a fresh container with latest volume config. */
export async function resetStoppedAgentRuntimeSandbox(agentId: string): Promise<void> {
  if (isAgentRunning(agentId)) {
    throw new Error('agent_running_stop_required')
  }

  const runtimeState = agentRuntimeStore.getAgentRuntimeState(agentId)
  if (!runtimeState) return
  if (!isPendingSandboxId(runtimeState.sandboxId)) {
    try {
      await getRuntime().remove(runtimeState.sandboxId)
    } catch (err: any) {
      if (!isSandboxNotFoundError(err)) {
        throw new Error(
          `Failed to reset runtime sandbox ${runtimeState.sandboxId} for agent ${agentId}: ${err?.message || 'unknown error'}`,
        )
      }
    }
    sandboxStore.deleteManagedRuntimeSandbox(runtimeState.sandboxId)
  }

  agentRuntimeStore.upsertAgentRuntimeState({
    agentId,
    sandboxName: runtimeState.sandboxName,
    sandboxId: getPendingSandboxId(agentId),
    guiHttpPort: runtimeState.guiHttpPort,
    guiHttpsPort: runtimeState.guiHttpsPort,
    hasSession: false,
    lastStartedAt: runtimeState.lastStartedAt,
    lastStoppedAt: runtimeState.lastStoppedAt,
  })
}

export async function listRunningAgentSandboxes(): Promise<Array<{
  sandboxId: string
  agentId: string
  status: 'running' | 'stopped'
  startedAt: number
  name: string
}>> {
  const out: Array<{
    sandboxId: string
    agentId: string
    status: 'running' | 'stopped'
    startedAt: number
    name: string
  }> = []
  const runtimeStates = agentRuntimeStore.listAgentRuntimeStates()
  const includedAgentIds = new Set<string>()

  for (const runtimeState of runtimeStates) {
    const running = runningAgents.get(runtimeState.agentId)
    const agent = running?.agent || agentStore.getAgent(runtimeState.agentId)
    if (!agent) continue

    let sandboxId = runtimeState.sandboxId
    if (!sandboxId || isPendingSandboxId(sandboxId)) {
      if (running?.sandboxId && !isPendingSandboxId(running.sandboxId)) {
        sandboxId = running.sandboxId
      } else if (running) {
        try {
          sandboxId = await running.box.getId()
        } catch {
          sandboxId = getRuntimeSandboxName(runtimeState.agentId)
        }
      } else {
        sandboxId = getRuntimeSandboxName(runtimeState.agentId)
      }
    }

    out.push({
      sandboxId,
      agentId: runtimeState.agentId,
      status: running ? 'running' : 'stopped',
      startedAt: running?.startedAt || runtimeState.lastStartedAt || runtimeState.createdAt,
      name: `${agent.name} runtime`,
    })
    includedAgentIds.add(runtimeState.agentId)
  }

  // Fallback safety: include any running agent that does not yet have runtime state.
  for (const [agentId, running] of runningAgents.entries()) {
    if (includedAgentIds.has(agentId)) continue

    let sandboxId = running.sandboxId
    if (!sandboxId || isPendingSandboxId(sandboxId)) {
      try {
        sandboxId = await running.box.getId()
      } catch {
        sandboxId = getRuntimeSandboxName(agentId)
      }
    }

    out.push({
      sandboxId,
      agentId,
      status: 'running',
      startedAt: running.startedAt || Date.now(),
      name: `${running.agent.name} runtime`,
    })
  }

  return out
}
