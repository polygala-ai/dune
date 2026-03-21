import { SimpleBox } from '@boxlite-ai/boxlite'
import { createServer } from 'node:net'
import { config as appConfig } from '../../config.js'
import { activeBySandboxId, getRuntime, withSandboxLock } from './runtime-state.js'
import { isSystemActor, ensureSandboxMetadataMutability, assertOperatePermission } from './acl.js'
import { resolveBox, sandboxToResource } from './resource.js'
import { ensureRuntimeSandboxRunning } from '../agents/runtime-sandbox.js'
import * as sandboxStore from '../../storage/sandbox-store.js'
import type { ActorIdentity, ActiveSandboxRuntime } from './types.js'
import type { BoxResource, ExecEvent } from '@dune/shared'

const DEFAULT_SANDBOX_EXEC_TIMEOUT_MS = 30_000
const DEFAULT_SANDBOX_EXEC_MAX_RETRIES = 2

function getSandboxExecTimeoutMs(): number {
  const value = Number(appConfig.sandboxExecTimeoutMs)
  if (!Number.isFinite(value)) return DEFAULT_SANDBOX_EXEC_TIMEOUT_MS
  return Math.max(50, Math.floor(value))
}

function getSandboxExecMaxRetries(): number {
  const value = Number(appConfig.sandboxExecMaxRetries)
  if (!Number.isFinite(value)) return DEFAULT_SANDBOX_EXEC_MAX_RETRIES
  return Math.max(0, Math.floor(value))
}

function isMissingShellError(message: string, shellCmd: string): boolean {
  const shellName = shellCmd.split('/').pop() || shellCmd
  const lower = message.toLowerCase()
  return (
    lower.includes(`failed to spawn '${shellCmd.toLowerCase()}'`)
    || lower.includes(`failed to spawn '${shellName.toLowerCase()}'`)
    || lower.includes(`executable '${shellCmd.toLowerCase()}' not found`)
    || lower.includes(`executable '${shellName.toLowerCase()}' not found`)
    || (lower.includes('no such file') && lower.includes(shellName.toLowerCase()))
    || (lower.includes('not found') && lower.includes(shellName.toLowerCase()) && (lower.includes('spawn') || lower.includes('executable')))
  )
}

function isTransientExecFailure(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('transport error')
    || lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('spawn_failed')
    || lower.includes('notify socket')
    || lower.includes('libcontainer')
  )
}

function isTimeoutExecFailure(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('timed out') || lower.includes('timeout')
}

function summarizeExecError(message: string, max = 180): string {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max)}...`
}

async function execWithTimeout(
  box: SimpleBox,
  cmd: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const boxExecPromise = box.exec(cmd, args, env)
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`box.exec timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([boxExecPromise, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

export async function execWithShellFallback(
  box: SimpleBox,
  command: string,
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: 'bash', args: ['-lc', command] },
    { cmd: '/bin/sh', args: ['-c', command] },
    { cmd: 'sh', args: ['-c', command] },
  ]
  const missingShellErrors: string[] = []
  const timeoutMs = getSandboxExecTimeoutMs()
  const maxRetries = getSandboxExecMaxRetries()

  for (const attempt of attempts) {
    for (let retry = 0; retry <= maxRetries; retry += 1) {
      try {
        const result = await execWithTimeout(box, attempt.cmd, attempt.args, env, timeoutMs)
        const probeText = `${result.stderr || ''}\n${result.stdout || ''}`
        if (result.exitCode !== 0 && isMissingShellError(probeText, attempt.cmd)) {
          missingShellErrors.push(`${attempt.cmd}: ${probeText.trim() || `exit ${result.exitCode}`}`)
          break
        }
        return result
      } catch (err: any) {
        const message = String(err?.message || err || '')
        if (isMissingShellError(message, attempt.cmd)) {
          missingShellErrors.push(`${attempt.cmd}: ${message}`)
          break
        }
        if (!isTransientExecFailure(message)) {
          throw new Error('box_exec_failed')
        }
        if (retry >= maxRetries) {
          throw new Error(isTimeoutExecFailure(message) ? 'box_exec_timeout' : 'box_exec_failed')
        }
        console.warn(
          `[sandboxes] transient exec failure (${retry + 1}/${maxRetries + 1}) via ${attempt.cmd}: ${summarizeExecError(message)}`,
        )
        continue
      }
    }
  }

  if (missingShellErrors.length > 0) {
    console.warn(`[sandboxes] no compatible shell found: ${missingShellErrors.join(' | ')}`)
  }
  throw new Error('no_compatible_shell')
}

export async function findAvailablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, () => {
      const address = server.address() as { port: number } | null
      const port = address?.port
      server.close((err) => {
        if (err) reject(err)
        else if (!port) reject(new Error('Failed to allocate port'))
        else resolvePort(port)
      })
    })
    server.on('error', reject)
  })
}

export function serializeExecEventLines(events: ExecEvent[]): string {
  return events.map((event) => `id: ${event.seq}\nevent: ${event.eventType}\ndata: ${JSON.stringify({
    executionId: event.executionId,
    seq: event.seq,
    timestamp: event.timestamp,
    data: event.data,
  })}\n`).join('\n') + '\n'
}

export async function startBoxUnlocked(identity: ActorIdentity, boxId: string): Promise<BoxResource | null> {
  const existing = await resolveBox(identity, boxId)
  if (!existing) return null
  if (existing._dune.managedByAgent && isSystemActor(identity)) {
    await ensureRuntimeSandboxRunning(boxId)
    const refreshed = await resolveBox(identity, boxId)
    return refreshed
  }

  ensureSandboxMetadataMutability(identity, existing)
  assertOperatePermission(identity, boxId)

  if (activeBySandboxId.has(boxId)) {
    const sandbox = sandboxStore.getSandbox(boxId)
    if (!sandbox) return null
    return sandboxToResource(sandbox, sandboxStore.listSandboxAcl(boxId))
  }

  const sandbox = sandboxStore.getSandbox(boxId)
  if (!sandbox) return null
  const runtimeName = `sandbox-${sandbox.id}`

  const hostPortsByGuest = new Map<number, number>()
  const mappedPorts = await Promise.all((sandbox.ports || []).map(async (port) => {
    const hostPort = port.hostPort && port.hostPort > 0 ? port.hostPort : await findAvailablePort()
    hostPortsByGuest.set(port.guestPort, hostPort)
    return { ...port, hostPort }
  }))

  const box = new SimpleBox({
    name: runtimeName,
    reuseExisting: true,
    image: sandbox.image,
    runtime: getRuntime(),
    cpus: sandbox.cpus,
    memoryMib: sandbox.memoryMib,
    diskSizeGb: sandbox.diskSizeGb,
    workingDir: sandbox.workingDir || undefined,
    env: sandbox.env,
    volumes: sandbox.volumes,
    ports: mappedPorts,
    entrypoint: sandbox.entrypoint.length > 0 ? sandbox.entrypoint : undefined,
    cmd: sandbox.cmd.length > 0 ? sandbox.cmd : undefined,
    user: sandbox.user || undefined,
    autoRemove: false,
    detach: sandbox.detach,
  })
  const boxliteBoxId = await box.getId()

  activeBySandboxId.set(boxId, {
    sandboxId: boxId,
    box,
    hostPortsByGuest,
  })
  sandboxStore.updateSandbox(boxId, {
    status: 'running',
    boxliteBoxId,
    startedAt: Date.now(),
    stoppedAt: null,
  })

  const updated = sandboxStore.getSandbox(boxId)
  if (!updated) return null
  return sandboxToResource(updated, sandboxStore.listSandboxAcl(boxId))
}

export async function startBox(identity: ActorIdentity, boxId: string): Promise<BoxResource | null> {
  return withSandboxLock(boxId, () => startBoxUnlocked(identity, boxId))
}

export async function ensureRuntimeBox(identity: ActorIdentity, boxId: string, options: { locked?: boolean } = {}): Promise<ActiveSandboxRuntime> {
  const existing = await resolveBox(identity, boxId)
  if (existing?._dune.managedByAgent && (isSystemActor(identity) || identity.actorType === 'human')) {
    const rt = await ensureRuntimeSandboxRunning(boxId)
    return {
      sandboxId: boxId,
      box: rt.box,
      hostPortsByGuest: new Map<number, number>(),
    }
  }

  const current = activeBySandboxId.get(boxId)
  if (current) return current
  const started = options.locked
    ? await startBoxUnlocked(identity, boxId)
    : await startBox(identity, boxId)
  if (!started) throw new Error('not_found')
  const runtimeEntry = activeBySandboxId.get(boxId)
  if (!runtimeEntry) throw new Error('failed_to_start')
  return runtimeEntry
}
