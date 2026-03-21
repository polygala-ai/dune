import type {
  ExecCreateRequest,
  ExecEvent,
  ExecListResponse,
  ExecResource,
} from '@dune/shared'
import * as sandboxStore from '../storage/sandbox-store.js'
import { withSandboxLock } from './runtime-state.js'
import { assertReadPermission, assertOperatePermission, ensureSandboxMutability, ensureBoxRunning } from './acl.js'
import { resolveBox } from './resource.js'
import { ensureRuntimeBox, serializeExecEventLines } from './exec-helpers.js'
import { splitNonEmptyLines } from './path-helpers.js'
import type { ActorIdentity } from './types.js'

export async function createExec(identity: ActorIdentity, boxId: string, req: ExecCreateRequest): Promise<ExecResource | null> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) return null
    ensureSandboxMutability(identity, box)
    assertOperatePermission(identity, boxId)
    ensureBoxRunning(identity, box)

    const runtimeEntry = await ensureRuntimeBox(identity, boxId, { locked: true })
    const created = sandboxStore.createExec(boxId, req)
    const startedAt = Date.now()

    void (async () => {
      try {
        const result = await runtimeEntry.box.exec(
          req.command,
          req.args || [],
          req.env || {},
        )

        const stdoutLines = splitNonEmptyLines(result.stdout)
        const stderrLines = splitNonEmptyLines(result.stderr)
        for (const line of stdoutLines) {
          sandboxStore.appendExecEvent(boxId, created.executionId, 'stdout', line)
        }
        for (const line of stderrLines) {
          sandboxStore.appendExecEvent(boxId, created.executionId, 'stderr', line)
        }

        sandboxStore.appendExecEvent(
          boxId,
          created.executionId,
          'exit',
          JSON.stringify({ exitCode: result.exitCode }),
        )

        const completedAt = Date.now()
        sandboxStore.updateExec(boxId, created.executionId, {
          status: result.exitCode === 0 ? 'completed' : 'failed',
          completedAt,
          durationMs: completedAt - startedAt,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          errorMessage: result.exitCode === 0 ? null : `exit ${result.exitCode}`,
        })
      } catch (err: any) {
        const completedAt = Date.now()
        const message = err?.message || 'Execution failed'
        sandboxStore.appendExecEvent(boxId, created.executionId, 'error', message)
        sandboxStore.updateExec(boxId, created.executionId, {
          status: 'failed',
          completedAt,
          durationMs: completedAt - startedAt,
          errorMessage: message,
        })
      }
    })()

    return created
  })
}

export async function listExecs(identity: ActorIdentity, boxId: string): Promise<ExecListResponse | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  return { execs: sandboxStore.listExecs(boxId) }
}

export async function getExec(identity: ActorIdentity, boxId: string, execId: string): Promise<ExecResource | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  return sandboxStore.getExec(boxId, execId)
}

export async function getExecEvents(identity: ActorIdentity, boxId: string, execId: string, afterSeq = 0, limit = 500): Promise<ExecEvent[] | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  const execution = sandboxStore.getExec(boxId, execId)
  if (!execution) return null
  const safeAfter = Number.isFinite(afterSeq) && afterSeq >= 0 ? Math.floor(afterSeq) : 0
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(1000, Math.floor(limit)) : 500
  return sandboxStore.listExecEvents(execId, safeAfter, safeLimit)
}

export async function streamExecEventsSse(identity: ActorIdentity, boxId: string, execId: string, afterSeq = 0, limit = 500): Promise<Response | null> {
  const events = await getExecEvents(identity, boxId, execId, afterSeq, limit)
  if (!events) return null
  const body = serializeExecEventLines(events)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
