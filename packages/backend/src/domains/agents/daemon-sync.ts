import { SimpleBox } from '@boxlite-ai/boxlite'
import { config } from '../../config.js'
import { join } from 'node:path'
import { readFileSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { timedExec, retriedExec, buildEnvAssignments } from './container-exec.js'
import {
  RPC_GUEST_PATH,
  LISTENER_GUEST_PATH,
  LISTENER_PROCESS_PATTERN,
  COMMUNICATION_DAEMON_REFRESH_INTERVAL_MS,
  AGENT_DUNE_CLAUDE_PATH,
  AGENT_DUNE_VOLUME_PATH,
  resolveBundledAssetDir,
} from './constants.js'
import type {
  RunningAgent,
  CommunicationDaemonAssetSyncResult,
  CommunicationDaemonProcessStatus,
  ReconcileCommunicationDaemonsOptions,
} from './constants.js'
import { ensureAgentRuntimeHostPaths } from './host-paths.js'
import { syncAgentSkills } from './skills-sync.js'
import { runningAgents } from './runtime-state.js'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Returns the agent-facing backend port.
 *  In packaged mode the sidecar passes PORT via env -> config.port.
 *  In dev mode we fall back to the .port file written by server.ts. */
export function getBackendPort(): number {
  if (config.port > 0) return config.port
  try {
    const raw = readFileSync(config.portFilePath, 'utf-8').trim()
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw)
      return parsed.agentPort || 0
    }
    return parseInt(raw, 10)
  } catch {
    return 0
  }
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/** Detect the host's IPv4 addresses from the host side. */
export function getHostLanIps(): string[] {
  const addresses: string[] = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (!iface.internal && iface.family === 'IPv4') addresses.push(iface.address)
    }
  }
  return dedupeStrings(addresses)
}

/** Read a Python file from the agent-mcp directory. */
export function readAgentMcpFile(filename: string): string {
  return readFileSync(join(resolveBundledAssetDir('agent-mcp'), filename), 'utf-8')
}

// ── Daemon asset sync ───────────────────────────────────────────────────

export function syncCommunicationDaemonAssets(agentId: string): CommunicationDaemonAssetSyncResult {
  const runtimeHostPaths = ensureAgentRuntimeHostPaths(agentId)
  const rootHostPath = runtimeHostPaths.duneRootHostPath
  const rpcCode = readAgentMcpFile('rpc.py')
  const listenerCode = readAgentMcpFile('listener.py')
  const assets = [
    { hostPath: join(rootHostPath, 'rpc.py'), content: rpcCode },
    { hostPath: join(rootHostPath, 'listener.py'), content: listenerCode },
  ]

  mkdirSync(rootHostPath, { recursive: true })

  // Clean up legacy daemon files from old path (system/communication/)
  const legacyCommunicationPath = join(rootHostPath, 'system', 'communication')
  if (existsSync(legacyCommunicationPath)) {
    rmSync(legacyCommunicationPath, { recursive: true, force: true })
  }

  let changed = false
  for (const asset of assets) {
    const existing = existsSync(asset.hostPath) ? readFileSync(asset.hostPath, 'utf-8') : null
    if (existing === asset.content) continue
    writeFileSync(asset.hostPath, asset.content, 'utf-8')
    changed = true
  }

  const assetHash = createHash('sha256').update(rpcCode).update('\0').update(listenerCode).digest('hex')
  return { rootHostPath, assetHash, changed }
}

export function __syncCommunicationDaemonAssetsForTests(agentId: string): CommunicationDaemonAssetSyncResult {
  return syncCommunicationDaemonAssets(agentId)
}

// ── Daemon lifecycle ────────────────────────────────────────────────────

export async function startCommunicationDaemons(
  box: SimpleBox,
  agentId: string,
  wsUrl: string,
): Promise<void> {
  const listenerEnv = buildEnvAssignments({
    DUNE_WS_URL: wsUrl,
    AGENT_ID: agentId,
    DUNE_RPC_SCRIPT: RPC_GUEST_PATH,
  })
  await retriedExec(
    box,
    'bash',
    ['-c', `nohup runuser -u abc -- env ${listenerEnv} python3 ${LISTENER_GUEST_PATH} > /tmp/listener.log 2>&1 &`],
    { DISPLAY: ':1' },
  )
  console.log(`Listener started for agent ${agentId}`)
}

export async function stopCommunicationDaemons(box: SimpleBox): Promise<void> {
  await timedExec(
    box,
    'bash',
    ['-c', `pkill -f "${LISTENER_PROCESS_PATTERN}" 2>/dev/null; true`],
    { DISPLAY: ':1' },
    10_000,
  )
}

export async function getCommunicationDaemonProcessStatus(box: SimpleBox): Promise<CommunicationDaemonProcessStatus> {
  const result = await retriedExec(
    box,
    'bash',
    ['-lc', `listener=0; pgrep -f "${LISTENER_PROCESS_PATTERN}" >/dev/null && listener=1; printf 'listener=%s\\n' "$listener"`],
    { DISPLAY: ':1' },
  )
  return { listenerRunning: /listener=1/.test(result.stdout) }
}

export function __getCommunicationDaemonProcessStatusForTests(
  box: SimpleBox,
): Promise<CommunicationDaemonProcessStatus> {
  return getCommunicationDaemonProcessStatus(box)
}

export async function reconcileCommunicationDaemons(
  running: RunningAgent,
  options: ReconcileCommunicationDaemonsOptions,
): Promise<boolean> {
  const { wsUrl, daemonAssetHash, force = false } = options
  let shouldRestart = force

  if (!shouldRestart) {
    shouldRestart = daemonAssetHash !== (running.daemonAssetHash || '')
  }

  if (!shouldRestart) {
    const processStatus = await getCommunicationDaemonProcessStatus(running.box)
    shouldRestart = !processStatus.listenerRunning
  }

  running.backendUrl = wsUrl
  running.daemonAssetHash = daemonAssetHash

  if (!shouldRestart) {
    return false
  }

  await stopCommunicationDaemons(running.box)
  await startCommunicationDaemons(running.box, running.agent.id, wsUrl)
  return true
}

export function __reconcileCommunicationDaemonsForTests(
  running: RunningAgent,
  options: ReconcileCommunicationDaemonsOptions,
): Promise<boolean> {
  return reconcileCommunicationDaemons(running, options)
}

// ── Periodic reconciliation ─────────────────────────────────────────────

export async function reconcileAllRunningCommunicationDaemons(): Promise<void> {
  const backendPort = getBackendPort()
  if (backendPort <= 0) return

  for (const [agentId, running] of runningAgents) {
    try {
      const daemonAssets = syncCommunicationDaemonAssets(agentId)
      const hostAddr = getHostLanIps()[0] || '127.0.0.1'
      const wsUrl = `ws://${hostAddr}:${backendPort}/ws/agent?agentId=${agentId}`
      const restarted = await reconcileCommunicationDaemons(running, {
        wsUrl,
        daemonAssetHash: daemonAssets.assetHash,
        force: false,
      })
      console.log(`${restarted ? 'Reconciled' : 'Skipped'} listener for ${running.agent.name}`)
    } catch (err: any) {
      console.error(`Failed to reconcile listener for agent ${agentId}:`, err.message)
    }
  }
}

export async function redeployAllDaemons(): Promise<void> {
  const backendPort = getBackendPort()
  if (backendPort <= 0) return

  // Lazy import to avoid circular dependency
  const { prepareAgentConfigFacadeInBox } = await import('./lifecycle.js')
  const { upsertClaudeSettingsInBox } = await import('./settings-sync.js')

  for (const [agentId, running] of runningAgents) {
    try {
      syncAgentSkills(agentId)
      await prepareAgentConfigFacadeInBox(running.box)
      await retriedExec(running.box, 'bash', ['-c',
        `mkdir -p ${AGENT_DUNE_CLAUDE_PATH}/skills && chown -R abc:abc ${AGENT_DUNE_VOLUME_PATH}`
      ], { DISPLAY: ':1' })
      await upsertClaudeSettingsInBox(running.box, agentId)

      const daemonAssets = syncCommunicationDaemonAssets(agentId)
      const hostAddr = getHostLanIps()[0] || '127.0.0.1'
      const wsUrl = `ws://${hostAddr}:${backendPort}/ws/agent?agentId=${agentId}`
      await reconcileCommunicationDaemons(running, {
        wsUrl,
        daemonAssetHash: daemonAssets.assetHash,
        force: true,
      })
      console.log(`Redeployed listener for ${running.agent.name}`)
    } catch (err: any) {
      console.error(`Failed to redeploy listener for agent ${agentId}:`, err.message)
    }
  }
}

let communicationDaemonRefreshInFlight = false
const communicationDaemonRefreshTimer = setInterval(() => {
  if (communicationDaemonRefreshInFlight) return
  communicationDaemonRefreshInFlight = true
  reconcileAllRunningCommunicationDaemons()
    .catch((err: any) => {
      console.warn('[communication-daemons] Periodic refresh failed:', err?.message || err)
    })
    .finally(() => {
      communicationDaemonRefreshInFlight = false
    })
}, COMMUNICATION_DAEMON_REFRESH_INTERVAL_MS)
communicationDaemonRefreshTimer.unref()
