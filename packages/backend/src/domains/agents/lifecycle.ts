import { SimpleBox } from '@boxlite-ai/boxlite'
import { createServer } from 'node:net'
import * as agentStore from '../../storage/agent-store.js'
import * as agentRuntimeStore from '../../storage/agent-runtime-store.js'
import { sendToAll as broadcastAll } from '../../gateway/broadcast.js'
import { clearGrantsForAgent } from '../host/gui-service.js'
import { config } from '../../config.js'
import { retriedExec, execChecked } from './container-exec.js'
import {
  SKILLBOX_IMAGE,
  SKILLBOX_MEMORY_MIB,
  SKILLBOX_DISK_SIZE_GB,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  DESKTOP_PROCESS_MARKERS,
  STARTUP_WATCHDOG_GRACE_MS,
  MCP_CONFIG_PATH,
  AGENT_DUNE_VOLUME_PATH,
  AGENT_DUNE_MEMORY_PATH,
  AGENT_DUNE_MINIAPPS_PATH,
  AGENT_DUNE_CLAUDE_PATH,
  AGENT_DUNE_CLAUDE_STATE_PATH,
  AGENT_MEMORY_VOLUME_PATH,
  AGENT_MINIAPP_VOLUME_PATH,
  AGENT_CLAUDE_VOLUME_PATH,
  CLAUDE_STATE_PATH,
  STOP_AGENT_SHUTDOWN_PROMPT,
  MCP_CONFIG,
} from './constants.js'
import type { DesktopReadinessDiagnostics, DesktopReadinessResult } from './constants.js'
import { runningAgents, agentLocks, getRuntime, setAgentStatus, emitAgentLogEntries, emitStartupLog } from './runtime-state.js'
import { newEventId } from '../../utils/ids.js'
import { ensureAgentRuntimeHostPaths, buildAgentRuntimeBaseVolumes, buildAgentRuntimeVolumes } from './host-paths.js'
import { syncCommunicationDaemonAssets, startCommunicationDaemons, getBackendPort, getHostLanIps } from './daemon-sync.js'
import { syncAgentSkills } from './skills-sync.js'
import { upsertClaudeSettingsInBox, buildClaudeCliAuthEnvValues } from './settings-sync.js'
import { ensureMiniappNginxConfiguredInBox } from './nginx.js'
import { getRuntimeSandboxName, getPendingSandboxId, isPendingSandboxId, canResumePersistedSession, upsertManagedRuntimeShadow, resetStoppedAgentRuntimeSandbox } from './runtime-sandbox.js'
import { _sendMessageInner, triggerInterruptSignals } from './messaging.js'

// ── Port allocation ─────────────────────────────────────────────────────

/** Find a random available TCP port. */
export function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const port = (srv.address() as any).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

export async function allocateGuiPorts(): Promise<{ guiHttpPort: number; guiHttpsPort: number }> {
  const guiHttpPort = await findAvailablePort()
  let guiHttpsPort = await findAvailablePort()
  while (guiHttpsPort === guiHttpPort) {
    guiHttpsPort = await findAvailablePort()
  }
  return { guiHttpPort, guiHttpsPort }
}

// ── Desktop readiness ───────────────────────────────────────────────────

export function truncateDiagnosticText(value: string, maxLen = 220): string {
  if (!value) return ''
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen)}...`
}

export function formatDesktopReadinessSummary(expected: string, diagnostics: DesktopReadinessDiagnostics): string {
  const parts = [
    `probes=${diagnostics.probeCount}`,
    `expected_size=${expected}`,
    `marker=${diagnostics.lastMatchedMarker ?? 'none'}`,
    `last_exit=${diagnostics.lastExitCode ?? 'n/a'}`,
    `last_timeout=${diagnostics.lastTimeout}`,
  ]

  if (diagnostics.lastError) parts.push(`last_error="${diagnostics.lastError}"`)
  if (diagnostics.lastStdout) parts.push(`stdout="${diagnostics.lastStdout}"`)
  if (diagnostics.lastStderr) parts.push(`stderr="${diagnostics.lastStderr}"`)

  return parts.join(' ')
}

export function detectDesktopMarker(stdout: string): string | null {
  for (const marker of DESKTOP_PROCESS_MARKERS) {
    const pattern = new RegExp(`\\b${marker}\\b`)
    if (pattern.test(stdout)) return marker
  }
  return null
}

/** Poll xwininfo until the XFCE desktop is ready at the expected resolution. */
export async function waitUntilDesktopReady(box: SimpleBox, signal?: AbortSignal): Promise<DesktopReadinessResult> {
  const timeoutMs = Math.max(1_000, config.agentStartupTimeoutMs)
  const pollMs = Math.max(100, config.agentDesktopPollMs)
  const deadline = Date.now() + timeoutMs
  const expected = `${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}`


  const diagnostics: DesktopReadinessDiagnostics = {
    probeCount: 0,
    lastExitCode: null,
    lastStdout: '',
    lastStderr: '',
    lastError: null,
    lastTimeout: false,
    lastMatchedMarker: null,
  }

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('desktop_not_ready: startup_aborted')
    }

    diagnostics.probeCount += 1
    try {
      const probeTimeoutMs = Math.max(1_500, Math.min(2_500, deadline - Date.now()))
      const result = await retriedExec(box, 'xwininfo', ['-tree', '-root'], { DISPLAY: ':1' }, probeTimeoutMs, 1)
      diagnostics.lastExitCode = result.exitCode
      diagnostics.lastStdout = truncateDiagnosticText(result.stdout, 260)
      diagnostics.lastStderr = truncateDiagnosticText(result.stderr, 200)
      diagnostics.lastError = null
      diagnostics.lastTimeout = false

      const xIsUp = result.exitCode === 0

      if (xIsUp) {
        let pgrepStdout = ''
        try {
          const pgrepResult = await retriedExec(box, 'pgrep', ['-x', DESKTOP_PROCESS_MARKERS.join('|')], {}, probeTimeoutMs, 1)
          pgrepStdout = pgrepResult.stdout
        } catch (_) { /* pgrep not found or no matches */ }

        const markerInXwininfo = detectDesktopMarker(result.stdout)
        const pgrepHasPids = /^\d+$/m.test(pgrepStdout.trim())
        const markerInPgrep = detectDesktopMarker(pgrepStdout) ?? (pgrepHasPids ? 'xfce4-session' : null)
        diagnostics.lastMatchedMarker = markerInXwininfo ?? markerInPgrep

        const hasDesktop = diagnostics.lastMatchedMarker !== null
        const hasSize = result.stdout.includes(expected)
        const readyViaXwininfo = hasDesktop && hasSize && markerInXwininfo !== null
        const readyViaPgrep = hasDesktop && markerInPgrep !== null

        if (readyViaXwininfo || readyViaPgrep) {
          return { probeCount: diagnostics.probeCount, matchedMarker: diagnostics.lastMatchedMarker! }
        }
      }
    } catch (err: any) {
      const message = truncateDiagnosticText(err?.message || String(err), 260)
      diagnostics.lastError = message
      diagnostics.lastTimeout = message.includes('timed out')
      diagnostics.lastStdout = ''
      diagnostics.lastStderr = ''
      diagnostics.lastExitCode = null
      diagnostics.lastMatchedMarker = null
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs))
  }

  throw new Error(`desktop_not_ready: timeout_ms=${timeoutMs} ${formatDesktopReadinessSummary(expected, diagnostics)}`)
}

export async function __waitUntilDesktopReadyForTests(box: SimpleBox, signal?: AbortSignal): Promise<DesktopReadinessResult> {
  return waitUntilDesktopReady(box, signal)
}

/** Verify Claude CLI is available (pre-installed in SkillBox image). */
export async function ensureCliInstalled(box: SimpleBox): Promise<void> {
  const check = await retriedExec(box, 'claude', ['--version'], { DISPLAY: ':1' })
  console.log('Claude CLI:', check.stdout.trim())
}

export async function prepareAgentConfigFacadeInBox(box: SimpleBox): Promise<void> {
  await execChecked(
    box,
    'python3',
    [
      '-c',
      `import os, pathlib, shutil, sys
dune_root, dune_memory, dune_miniapps, dune_claude, dune_state, memory_link, miniapps_link, claude_link, state_link = sys.argv[1:]
for path in (dune_root, dune_memory, dune_miniapps, dune_claude, os.path.join(dune_claude, 'skills')):
    os.makedirs(path, exist_ok=True)
if not os.path.exists(dune_state):
    pathlib.Path(dune_state).write_text('{}\\n')
for link_path, target_path in (
    (memory_link, dune_memory),
    (miniapps_link, dune_miniapps),
    (claude_link, dune_claude),
    (state_link, dune_state),
):
    if os.path.lexists(link_path):
        if os.path.islink(link_path) or os.path.isfile(link_path):
            os.unlink(link_path)
        else:
            shutil.rmtree(link_path)
    os.symlink(target_path, link_path)
`,
      AGENT_DUNE_VOLUME_PATH,
      AGENT_DUNE_MEMORY_PATH,
      AGENT_DUNE_MINIAPPS_PATH,
      AGENT_DUNE_CLAUDE_PATH,
      AGENT_DUNE_CLAUDE_STATE_PATH,
      AGENT_MEMORY_VOLUME_PATH,
      AGENT_MINIAPP_VOLUME_PATH,
      AGENT_CLAUDE_VOLUME_PATH,
      CLAUDE_STATE_PATH,
    ],
    { DISPLAY: ':1' },
    20_000,
    2,
  )

  await retriedExec(
    box,
    'bash',
    ['-c', `chown -R abc:abc ${AGENT_DUNE_VOLUME_PATH} 2>/dev/null; true`],
    { DISPLAY: ':1' },
    20_000,
    2,
  )
}

export async function __prepareAgentConfigFacadeInBoxForTests(box: SimpleBox): Promise<void> {
  await prepareAgentConfigFacadeInBox(box)
}

// ── Startup state ───────────────────────────────────────────────────────

/** Abort controllers for in-progress startups, keyed by agentId. */
const startupAbortControllers = new Map<string, AbortController>()
const startupAbortReasons = new Map<string, 'cancel' | 'watchdog'>()
const startupWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Deduplicates concurrent startup attempts. */
const startupPromises = new Map<string, Promise<void>>()

function clearStartupWatchdog(agentId: string): void {
  const timer = startupWatchdogTimers.get(agentId)
  if (timer) {
    clearTimeout(timer)
    startupWatchdogTimers.delete(agentId)
  }
}

function armStartupWatchdog(agentId: string, timeoutMs: number): void {
  clearStartupWatchdog(agentId)
  const effectiveTimeoutMs = Math.max(1_000, timeoutMs) + STARTUP_WATCHDOG_GRACE_MS
  const timer = setTimeout(() => {
    const controller = startupAbortControllers.get(agentId)
    if (!controller || controller.signal.aborted) return

    startupAbortReasons.set(agentId, 'watchdog')
    controller.abort()
    setAgentStatus(agentId, 'error', { source: 'startup-watchdog', reason: `startup timeout after ${effectiveTimeoutMs}ms` })
    emitStartupLog(agentId, `Startup watchdog timeout after ${effectiveTimeoutMs}ms`)
  }, effectiveTimeoutMs)
  timer.unref()
  startupWatchdogTimers.set(agentId, timer)
}

/** Check if startup was cancelled; throw if so. */
function checkAborted(signal: AbortSignal, agentId: string) {
  if (signal.aborted) {
    if (startupAbortReasons.get(agentId) === 'watchdog') {
      throw new Error(`desktop_not_ready: startup_timeout_exceeded timeout_ms=${Math.max(1_000, config.agentStartupTimeoutMs)}`)
    }
    throw new Error(`Startup cancelled for agent ${agentId}`)
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export function cancelStartup(agentId: string): boolean {
  const controller = startupAbortControllers.get(agentId)
  if (!controller) return false
  startupAbortReasons.set(agentId, 'cancel')
  controller.abort()
  return true
}

export async function ensureAgentRunning(agentId: string): Promise<{
  guiHttpPort: number
  guiHttpsPort: number
  width: number
  height: number
}> {
  const running = runningAgents.get(agentId)
  if (running) {
    return {
      guiHttpPort: running.guiHttpPort,
      guiHttpsPort: running.guiHttpsPort,
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
    }
  }

  let startup = startupPromises.get(agentId)
  if (!startup) {
    startup = startAgent(agentId)
    startupPromises.set(agentId, startup)
    startup.finally(() => {
      if (startupPromises.get(agentId) === startup) {
        startupPromises.delete(agentId)
      }
    }).catch(() => {})
  }

  await startup
  const { getAgentScreen } = await import('./screen.js')
  const screen = getAgentScreen(agentId)
  if (!screen) {
    throw new Error(`Agent ${agentId} did not expose a screen after startup`)
  }
  return screen
}

export async function startAgent(agentId: string): Promise<void> {
  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  if (runningAgents.has(agentId)) {
    throw new Error(`Agent ${agentId} is already running`)
  }

  // Set up cancellation
  const abortController = new AbortController()
  startupAbortControllers.set(agentId, abortController)
  startupAbortReasons.delete(agentId)
  armStartupWatchdog(agentId, config.agentStartupTimeoutMs)
  const signal = abortController.signal

  // Broadcast 'starting' status
  setAgentStatus(agentId, 'starting', { source: 'start-agent' })

  emitStartupLog(agentId, 'Creating container...')

  const sandboxName = getRuntimeSandboxName(agentId)
  let runtimeState = agentRuntimeStore.getAgentRuntimeState(agentId)
  if (!runtimeState) {
    const ports = await allocateGuiPorts()
    runtimeState = agentRuntimeStore.upsertAgentRuntimeState({
      agentId,
      sandboxName,
      sandboxId: getPendingSandboxId(agentId),
      guiHttpPort: ports.guiHttpPort,
      guiHttpsPort: ports.guiHttpsPort,
    })
  } else if (runtimeState.sandboxName !== sandboxName) {
    runtimeState = agentRuntimeStore.upsertAgentRuntimeState({
      agentId,
      sandboxName,
      sandboxId: runtimeState.sandboxId,
      guiHttpPort: runtimeState.guiHttpPort,
      guiHttpsPort: runtimeState.guiHttpsPort,
      lastStartedAt: runtimeState.lastStartedAt,
      lastStoppedAt: runtimeState.lastStoppedAt,
    })
  }

  const guiHttpPort = runtimeState.guiHttpPort
  const guiHttpsPort = runtimeState.guiHttpsPort

  // Constructor env — DO NOT set HOME/PATH here, it breaks s6-overlay init.
  const env: Record<string, string> = {
    DISPLAY: ':1',
    DISPLAY_SIZEW: String(DISPLAY_WIDTH),
    DISPLAY_SIZEH: String(DISPLAY_HEIGHT),
    SELKIES_MANUAL_WIDTH: String(DISPLAY_WIDTH),
    SELKIES_MANUAL_HEIGHT: String(DISPLAY_HEIGHT),
    SELKIES_UI_SHOW_SIDEBAR: 'false',
    SELKIES_SCALING_DPI: '96',
    GDK_SCALE: '1',
    GDK_DPI_SCALE: '1',
  }
  Object.assign(env, buildClaudeCliAuthEnvValues())

  let backendUrl = ''
  let sandboxId = runtimeState.sandboxId
  let box: SimpleBox | null = null
  try {
    const runtimeHostPaths = ensureAgentRuntimeHostPaths(agentId)
    const daemonAssets = syncCommunicationDaemonAssets(agentId)
    syncAgentSkills(agentId)
    const baseVolumes = buildAgentRuntimeBaseVolumes(runtimeHostPaths)
    const runtimeVolumes = buildAgentRuntimeVolumes(agentId, baseVolumes)
    const hasConfiguredMounts = runtimeVolumes.length > baseVolumes.length
    if (hasConfiguredMounts && !isPendingSandboxId(runtimeState.sandboxId)) {
      await resetStoppedAgentRuntimeSandbox(agentId)
      const refreshed = agentRuntimeStore.getAgentRuntimeState(agentId)
      if (refreshed) {
        runtimeState = refreshed
        sandboxId = refreshed.sandboxId
      }
    }

    box = new SimpleBox({
      name: sandboxName,
      reuseExisting: true,
      autoRemove: false,
      detach: false,
      image: SKILLBOX_IMAGE,
      env,
      runtime: getRuntime(),
      memoryMib: SKILLBOX_MEMORY_MIB,
      diskSizeGb: SKILLBOX_DISK_SIZE_GB,
      ports: [
        { hostPort: guiHttpPort, guestPort: 3000 },
        { hostPort: guiHttpsPort, guestPort: 3001 },
      ],
      volumes: runtimeVolumes,
    })

    sandboxId = await box.getId()
    const canResumeInitialSession = canResumePersistedSession(runtimeState, sandboxId)
    if (
      sandboxId !== runtimeState.sandboxId
      || isPendingSandboxId(runtimeState.sandboxId)
      || runtimeState.hasSession !== canResumeInitialSession
    ) {
      runtimeState = agentRuntimeStore.upsertAgentRuntimeState({
        agentId,
        sandboxName,
        sandboxId,
        guiHttpPort,
        guiHttpsPort,
        hasSession: canResumeInitialSession,
        lastStartedAt: runtimeState.lastStartedAt,
        lastStoppedAt: runtimeState.lastStoppedAt,
      })
    }
    upsertManagedRuntimeShadow(agentId, sandboxId, {
      status: 'stopped',
      startedAt: runtimeState.lastStartedAt,
      stoppedAt: runtimeState.lastStoppedAt,
    })

    checkAborted(signal, agentId)

    emitStartupLog(
      agentId,
      `Waiting for desktop environment (timeout=${Math.max(1_000, config.agentStartupTimeoutMs)}ms poll=${Math.max(100, config.agentDesktopPollMs)}ms)...`,
    )

    console.log(`Waiting for desktop ready (agent ${agentId})...`)
    const desktopReady = await waitUntilDesktopReady(box, signal)
    emitStartupLog(agentId, `Desktop ready after ${desktopReady.probeCount} probes (${desktopReady.matchedMarker})`)
    console.log(`Desktop ready (agent ${agentId})`)
    sandboxId = await box.getId()
    const canResumeDesktopSession = canResumePersistedSession(runtimeState, sandboxId)
    if (
      sandboxId !== runtimeState.sandboxId
      || isPendingSandboxId(runtimeState.sandboxId)
      || runtimeState.hasSession !== canResumeDesktopSession
    ) {
      runtimeState = agentRuntimeStore.upsertAgentRuntimeState({
        agentId,
        sandboxName,
        sandboxId,
        guiHttpPort,
        guiHttpsPort,
        hasSession: canResumeDesktopSession,
        lastStartedAt: runtimeState.lastStartedAt,
        lastStoppedAt: runtimeState.lastStoppedAt,
      })
    }

    checkAborted(signal, agentId)
    emitStartupLog(agentId, 'Configuring browser and services...')

    await retriedExec(box, 'bash', ['-c', 'echo \'CHROMIUM_FLAGS="$CHROMIUM_FLAGS --force-device-scale-factor=0.8"\' > /etc/chromium.d/scale-factor'], { DISPLAY: ':1' })

    await ensureCliInstalled(box)

    emitStartupLog(agentId, 'Preparing persistent config...')
    await prepareAgentConfigFacadeInBox(box)
    emitStartupLog(agentId, 'Persistent config ready.')

    emitStartupLog(agentId, 'Ensuring miniapp nginx routes...')
    await ensureMiniappNginxConfiguredInBox(box, agentId)
    emitStartupLog(agentId, 'Miniapp nginx route ensured.')

    await retriedExec(box, 'bash', ['-c', `echo '${MCP_CONFIG}' > ${MCP_CONFIG_PATH} && chown abc:abc ${MCP_CONFIG_PATH}`], { DISPLAY: ':1' })

    emitStartupLog(agentId, 'Updating Claude settings...')
    await upsertClaudeSettingsInBox(box, agentId)
    emitStartupLog(agentId, 'Claude settings ready.')

    await retriedExec(
      box,
      'bash',
      ['-c', `mkdir -p ${AGENT_DUNE_MEMORY_PATH} ${AGENT_DUNE_MINIAPPS_PATH} ${AGENT_DUNE_CLAUDE_PATH}/skills && chown abc:abc ${AGENT_DUNE_VOLUME_PATH} && chown -R abc:abc ${AGENT_DUNE_MEMORY_PATH} ${AGENT_DUNE_MINIAPPS_PATH} ${AGENT_DUNE_CLAUDE_PATH}`],
      { DISPLAY: ':1' },
    )

    if (hasConfiguredMounts) {
      const writableMountPaths = runtimeVolumes
        .filter((v) => !v.readOnly && v.guestPath.startsWith('/workspace/'))
        .map((v) => v.guestPath)
      if (writableMountPaths.length > 0) {
        await retriedExec(
          box,
          'bash',
          ['-c', `chown -R abc:abc ${writableMountPaths.join(' ')}`],
          { DISPLAY: ':1' },
        )
      }
    }

    checkAborted(signal, agentId)
    emitStartupLog(agentId, 'Deploying communication listener...')

    const backendPort = getBackendPort()
    if (backendPort > 0) {
      const hostIps = getHostLanIps()
      const hostAddr = hostIps[0] || '127.0.0.1'
      const wsUrl = `ws://${hostAddr}:${backendPort}/ws/agent?agentId=${agentId}`
      backendUrl = wsUrl
      console.log(`Backend host for agent ${agentId}: ${hostAddr} (candidates: ${hostIps.join(', ')})`)
      try {
        await startCommunicationDaemons(box, agentId, wsUrl)
        console.log(`Listener started for agent ${agentId}: ${wsUrl}`)
      } catch (err: any) {
        console.warn(`Failed to start listener for agent ${agentId}: ${err.message}`)
      }
    } else {
      console.warn(`Backend port not detected — listener not deployed for agent ${agentId}`)
    }

    if (isPendingSandboxId(sandboxId)) {
      sandboxId = await box.getId()
    }
    runtimeState = agentRuntimeStore.upsertAgentRuntimeState({
      agentId,
      sandboxName,
      sandboxId,
      guiHttpPort,
      guiHttpsPort,
      hasSession: runtimeState.hasSession,
      lastStartedAt: runtimeState.lastStartedAt,
      lastStoppedAt: runtimeState.lastStoppedAt,
    })
    const startedAt = Date.now()
    agentRuntimeStore.touchAgentRuntimeStarted(agentId, startedAt)
    upsertManagedRuntimeShadow(agentId, runtimeState.sandboxId, {
      status: 'running',
      startedAt,
      stoppedAt: null,
    })

    runningAgents.set(agentId, {
      box,
      agent,
      sandboxId: runtimeState.sandboxId,
      guiHttpPort,
      guiHttpsPort,
      backendUrl,
      daemonAssetHash: daemonAssets.assetHash,
      cliInstalled: true,
      hasSession: runtimeState.hasSession,
      sessionId: runtimeState.sessionId,
      startedAt,
      thinkingSince: 0,
      currentExecution: null,
      interruptRequested: false,
      interruptAbort: null,
    })

    setAgentStatus(agentId, 'idle', { source: 'start-agent', broadcast: false })
    emitStartupLog(agentId, 'Agent ready')

    broadcastAll({
      type: 'agent:screen',
      payload: { agentId, guiHttpPort, guiHttpsPort, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
    })
  } catch (err) {
    if (box) {
      try {
        await Promise.race([box.stop(), new Promise<never>((_, r) => setTimeout(() => r(new Error('cleanup timeout')), 15_000))])
      } catch {}
    }
    if (!isPendingSandboxId(sandboxId)) {
      const failedAt = Date.now()
      agentRuntimeStore.touchAgentRuntimeStopped(agentId, failedAt)
      const latestState = agentRuntimeStore.getAgentRuntimeState(agentId)
      if (latestState) runtimeState = latestState
      upsertManagedRuntimeShadow(agentId, sandboxId, {
        status: 'stopped',
        startedAt: runtimeState.lastStartedAt,
        stoppedAt: failedAt,
      })
    }
    const abortReason = startupAbortReasons.get(agentId)
    if (signal.aborted && abortReason === 'cancel') {
      setAgentStatus(agentId, 'stopped', { source: 'start-agent', reason: 'startup cancelled' })
      emitStartupLog(agentId, 'Startup cancelled')
    } else {
      const errorMessage = (err as Error).message?.slice(0, 900) || 'unknown error'
      setAgentStatus(agentId, 'error', { source: 'start-agent', reason: errorMessage })
      emitStartupLog(agentId, `Startup failed: ${errorMessage}`)
    }
    throw err
  } finally {
    clearStartupWatchdog(agentId)
    startupAbortControllers.delete(agentId)
    startupAbortReasons.delete(agentId)
  }
}

export async function stopAgent(agentId: string): Promise<void> {
  const running = runningAgents.get(agentId)
  if (running) {
    if (running.hasSession) {
      try {
        setAgentStatus(agentId, 'stopping', { source: 'stop-agent' })

        await Promise.race([
          _sendMessageInner(agentId, running, [{
            authorName: 'System',
            content: STOP_AGENT_SHUTDOWN_PROMPT,
          }]),
          new Promise<string>((resolve) => setTimeout(() => resolve('[TIMEOUT]'), 30_000)),
        ])
      } catch {
        // Memory dump failure must never block shutdown
      }
    }

    if (running.currentExecution) {
      try { await running.currentExecution.kill() } catch {}
      running.currentExecution = null
    }
    agentLocks.delete(agentId)

    try {
      await Promise.race([
        running.box.stop(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('box.stop() timed out')), 30_000)),
      ])
    } catch (err: any) {
      console.error(`Failed to stop box for agent ${agentId}:`, err.message)
    }
    runningAgents.delete(agentId)
    clearGrantsForAgent(agentId)
  }
  const stoppedAt = Date.now()
  agentRuntimeStore.touchAgentRuntimeStopped(agentId, stoppedAt)
  const runtimeState = agentRuntimeStore.getAgentRuntimeState(agentId)
  if (runtimeState) {
    upsertManagedRuntimeShadow(agentId, runtimeState.sandboxId, {
      status: 'stopped',
      startedAt: runtimeState.lastStartedAt,
      stoppedAt,
    })
  }
  setAgentStatus(agentId, 'stopped', { source: 'stop-agent', broadcast: false })
}

export async function interruptAgentWorkflow(agentId: string): Promise<boolean> {
  const running = runningAgents.get(agentId)
  if (!running) return false
  const hasActiveTurn = Boolean(running.currentExecution) || running.thinkingSince > 0 || agentLocks.has(agentId)
  if (!hasActiveTurn) return false

  running.interruptRequested = true
  triggerInterruptSignals(agentId, running)

  // Safety net: if the abort signal + kill didn't finalize within 3s, force-reset
  setTimeout(() => {
    const current = runningAgents.get(agentId)
    if (!current || !current.interruptRequested) return
    const agent = agentStore.getAgent(agentId)
    if (!agent || (agent.status !== 'thinking' && agent.status !== 'responding')) return
    console.warn(`[${agentId}] Interrupt safety timeout — force-resetting to idle`)
    current.thinkingSince = 0
    current.currentExecution = null
    current.interruptRequested = false
    current.interruptAbort = null
    agentLocks.delete(agentId)
    setAgentStatus(agentId, 'idle', { source: 'interrupt-timeout', reason: 'interrupt did not finalize within 3s' })
    emitAgentLogEntries(agentId, [{
      id: newEventId(),
      agentId,
      timestamp: Date.now(),
      type: 'system',
      data: { message: 'Workflow interrupted (forced timeout).' },
    }])
  }, 3_000)

  return true
}

export async function stopAllAgents(): Promise<void> {
  for (const [id] of runningAgents) {
    await stopAgent(id)
  }
}
