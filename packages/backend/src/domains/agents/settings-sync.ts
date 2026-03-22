import { SimpleBox } from '@boxlite-ai/boxlite'
import * as agentStore from '../../storage/agent-store.js'
import { getEffectiveClaudeSettings } from '../../storage/claude-settings-store.js'
import { retriedExec, deployFile } from './container-exec.js'
import {
  AGENT_DUNE_CLAUDE_PATH,
  CLAUDE_SETTINGS_PATH,
  MANAGED_ENV_KEYS,
} from './constants.js'
import type {
  ClaudeSettingsEnvValues,
  ClaudeCliAuthEnvValues,
  ClaudeSettingsSyncAgentResult,
  ClaudeSettingsSyncSummary,
} from './constants.js'
import { runningAgents } from './runtime-state.js'

export function buildClaudeSettingsEnvValues(): ClaudeSettingsEnvValues {
  const effective = getEffectiveClaudeSettings()
  const values: ClaudeSettingsEnvValues = {}
  if (effective.anthropicAuthToken) values.ANTHROPIC_AUTH_TOKEN = effective.anthropicAuthToken
  if (effective.anthropicBaseUrl) values.ANTHROPIC_BASE_URL = effective.anthropicBaseUrl
  if (effective.claudeCodeDisableNonessentialTraffic) {
    values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = effective.claudeCodeDisableNonessentialTraffic
  }
  return values
}

export function buildClaudeCliAuthEnvValues(): ClaudeCliAuthEnvValues {
  const effective = getEffectiveClaudeSettings()
  const values: ClaudeCliAuthEnvValues = {}
  if (effective.anthropicApiKey) values.ANTHROPIC_API_KEY = effective.anthropicApiKey
  if (effective.claudeCodeOAuthToken) values.CLAUDE_CODE_OAUTH_TOKEN = effective.claudeCodeOAuthToken
  return values
}

export function mergeClaudeSettingsContent(
  existingContent: string | null | undefined,
  envValues: ClaudeSettingsEnvValues,
): string {
  let root: Record<string, unknown> = {}
  const trimmed = existingContent?.trim()
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        root = { ...(parsed as Record<string, unknown>) }
      }
    } catch {
      root = {}
    }
  }

  const existingEnv = root.env
  const mergedEnv: Record<string, unknown> =
    existingEnv && typeof existingEnv === 'object' && !Array.isArray(existingEnv)
      ? { ...(existingEnv as Record<string, unknown>) }
      : {}

  // Remove managed keys that are no longer set, so clearing a value
  // in the UI actually takes effect instead of leaving stale entries.
  for (const key of MANAGED_ENV_KEYS) {
    if (!(key in envValues) || envValues[key] == null || envValues[key] === '') {
      delete mergedEnv[key]
    }
  }

  for (const [key, value] of Object.entries(envValues)) {
    if (value != null && value !== '') {
      mergedEnv[key] = value
    }
  }
  root.env = mergedEnv

  return `${JSON.stringify(root, null, 2)}\n`
}

export function __mergeClaudeSettingsContentForTests(
  existingContent: string | null | undefined,
  envValues: ClaudeSettingsEnvValues,
): string {
  return mergeClaudeSettingsContent(existingContent, envValues)
}

export function __buildClaudeSettingsEnvValuesForTests(): ClaudeSettingsEnvValues {
  return buildClaudeSettingsEnvValues()
}

export function __buildClaudeCliAuthEnvValuesForTests(): ClaudeCliAuthEnvValues {
  return buildClaudeCliAuthEnvValues()
}

export async function upsertClaudeSettingsInBox(box: SimpleBox, agentId: string): Promise<void> {
  const envValues = buildClaudeSettingsEnvValues()
  await retriedExec(
    box,
    'bash',
    ['-c', `mkdir -p ${AGENT_DUNE_CLAUDE_PATH} && chown -R abc:abc ${AGENT_DUNE_CLAUDE_PATH}`],
    { DISPLAY: ':1' },
  )

  let existingContent = ''
  const readResult = await retriedExec(
    box,
    'bash',
    ['-lc', `[ -f "${CLAUDE_SETTINGS_PATH}" ] && cat "${CLAUDE_SETTINGS_PATH}" || true`],
    { DISPLAY: ':1' },
  )
  if (readResult.exitCode === 0) {
    existingContent = readResult.stdout
  }

  const nextContent = mergeClaudeSettingsContent(existingContent, envValues)
  await deployFile(box, nextContent, CLAUDE_SETTINGS_PATH)
  console.log(`Updated Claude settings for agent ${agentId}: ${Object.keys(envValues).join(', ') || 'no env overrides'}`)
}

// ── Bulk sync ───────────────────────────────────────────────────────────

// Forward declaration — will be set by lifecycle.ts to avoid circular imports
let _ensureAgentRunning: ((agentId: string) => Promise<any>) | null = null
let _stopAgent: ((agentId: string) => Promise<void>) | null = null

export function __setLifecycleDeps(deps: {
  ensureAgentRunning: (agentId: string) => Promise<any>
  stopAgent: (agentId: string) => Promise<void>
}): void {
  _ensureAgentRunning = deps.ensureAgentRunning
  _stopAgent = deps.stopAgent
}

export async function syncClaudeSettingsForAllAgents(): Promise<ClaudeSettingsSyncSummary> {
  const agents = agentStore.listAgents()
  const initialStatusByAgent = new Map(agents.map(agent => [agent.id, agent.status]))
  const results: ClaudeSettingsSyncAgentResult[] = []

  for (const agent of agents) {
    const initialStatus = initialStatusByAgent.get(agent.id) || 'stopped'
    const wasRunning = initialStatus !== 'stopped'
    let startedForSync = false

    try {
      let running = runningAgents.get(agent.id)
      if (!running) {
        if (!_ensureAgentRunning) throw new Error('lifecycle deps not initialized')
        await _ensureAgentRunning(agent.id)
        running = runningAgents.get(agent.id)
        startedForSync = true
      }
      if (!running) {
        throw new Error(`Agent ${agent.id} failed to start for settings sync`)
      }

      await upsertClaudeSettingsInBox(running.box, agent.id)
      results.push({
        agentId: agent.id,
        name: agent.name,
        wasRunning,
        startedForSync,
        updated: true,
        stoppedAfterSync: false,
      })
    } catch (err: any) {
      results.push({
        agentId: agent.id,
        name: agent.name,
        wasRunning,
        startedForSync,
        updated: false,
        stoppedAfterSync: false,
        error: err?.message || 'unknown error',
      })
    }
  }

  for (const result of results) {
    const initialStatus = initialStatusByAgent.get(result.agentId) || 'stopped'
    if (initialStatus !== 'stopped') continue
    if (!runningAgents.has(result.agentId)) continue

    try {
      if (!_stopAgent) throw new Error('lifecycle deps not initialized')
      await _stopAgent(result.agentId)
      result.stoppedAfterSync = true
    } catch (err: any) {
      result.stopError = err?.message || 'unknown stop error'
    }
  }

  const updated = results.filter(result => result.updated).length
  const failed = results.length - updated
  const restoredStopped = results.filter(result => result.stoppedAfterSync).length

  return {
    total: results.length,
    updated,
    failed,
    restoredStopped,
    results,
  }
}

export async function syncClaudeSettingsForRunningAgents(): Promise<ClaudeSettingsSyncSummary> {
  const results: ClaudeSettingsSyncAgentResult[] = []

  for (const [agentId, running] of runningAgents) {
    try {
      await upsertClaudeSettingsInBox(running.box, agentId)
      results.push({
        agentId,
        name: running.agent.name,
        wasRunning: true,
        startedForSync: false,
        updated: true,
        stoppedAfterSync: false,
      })
    } catch (err: any) {
      results.push({
        agentId,
        name: running.agent.name,
        wasRunning: true,
        startedForSync: false,
        updated: false,
        stoppedAfterSync: false,
        error: err?.message || 'unknown error',
      })
    }
  }

  const updated = results.filter(result => result.updated).length
  const failed = results.length - updated

  return {
    total: results.length,
    updated,
    failed,
    restoredStopped: 0,
    results,
  }
}
