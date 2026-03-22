import * as agentRuntimeMountStore from '../../storage/agent-runtime-mount-store.js'
import { config } from '../../config.js'
import { dirname, join } from 'node:path'
import { mkdirSync, existsSync, statSync, cpSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import {
  AGENT_DUNE_VOLUME_PATH,
} from './constants.js'
import type { RuntimeVolumeSpec, AgentRuntimeHostPaths } from './constants.js'

export function getAgentDuneHostPath(agentId: string): string {
  return join(config.agentsRoot, agentId, '.dune')
}

export function getAgentClaudeHostPath(agentId: string): string {
  return join(getAgentDuneHostPath(agentId), '.claude')
}

export function getAgentClaudeStateHostPath(agentId: string): string {
  return join(getAgentDuneHostPath(agentId), '.claude.json')
}

export function getAgentCommunicationHostPath(agentId: string): string {
  return join(getAgentDuneHostPath(agentId), 'system', 'communication')
}

export function getAgentSkillsHostPath(agentId: string): string {
  return join(getAgentClaudeHostPath(agentId), 'skills')
}

export function moveAgentPersistencePathIfNeeded(legacyPath: string, nextPath: string): void {
  if (!existsSync(legacyPath) || existsSync(nextPath)) return

  mkdirSync(dirname(nextPath), { recursive: true })

  try {
    renameSync(legacyPath, nextPath)
    return
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
  }

  const legacyStat = statSync(legacyPath)
  cpSync(legacyPath, nextPath, { recursive: legacyStat.isDirectory() })
  rmSync(legacyPath, { recursive: legacyStat.isDirectory(), force: true })
}

export function migrateLegacyAgentPersistence(agentId: string, duneRootHostPath: string): void {
  const legacyRoot = join(config.agentsRoot, agentId)
  mkdirSync(duneRootHostPath, { recursive: true })

  moveAgentPersistencePathIfNeeded(join(legacyRoot, 'memory'), join(duneRootHostPath, 'memory'))
  moveAgentPersistencePathIfNeeded(join(legacyRoot, 'miniapps'), join(duneRootHostPath, 'miniapps'))
  moveAgentPersistencePathIfNeeded(join(legacyRoot, '.claude'), join(duneRootHostPath, '.claude'))
  moveAgentPersistencePathIfNeeded(join(legacyRoot, '.claude.json'), join(duneRootHostPath, '.claude.json'))
}

export function ensureAgentRuntimeHostPaths(agentId: string): AgentRuntimeHostPaths {
  const duneRootHostPath = getAgentDuneHostPath(agentId)
  migrateLegacyAgentPersistence(agentId, duneRootHostPath)

  const memoryHostPath = join(duneRootHostPath, 'memory')
  const miniappHostPath = join(duneRootHostPath, 'miniapps')
  const claudeHostPath = getAgentClaudeHostPath(agentId)
  const claudeStateHostPath = getAgentClaudeStateHostPath(agentId)
  const communicationHostPath = getAgentCommunicationHostPath(agentId)

  mkdirSync(duneRootHostPath, { recursive: true })
  mkdirSync(memoryHostPath, { recursive: true })
  mkdirSync(miniappHostPath, { recursive: true })
  mkdirSync(claudeHostPath, { recursive: true })
  mkdirSync(communicationHostPath, { recursive: true })
  if (!existsSync(claudeStateHostPath)) {
    writeFileSync(claudeStateHostPath, '{}\n', 'utf-8')
  }

  return {
    duneRootHostPath,
    memoryHostPath,
    miniappHostPath,
    claudeHostPath,
    claudeStateHostPath,
    communicationHostPath,
  }
}

export function __ensureAgentRuntimeHostPathsForTests(agentId: string): AgentRuntimeHostPaths {
  return ensureAgentRuntimeHostPaths(agentId)
}

export function buildAgentRuntimeBaseVolumes(hostPaths: AgentRuntimeHostPaths): RuntimeVolumeSpec[] {
  return [
    { hostPath: hostPaths.duneRootHostPath, guestPath: AGENT_DUNE_VOLUME_PATH },
  ]
}

export function __buildAgentRuntimeBaseVolumesForTests(agentId: string): RuntimeVolumeSpec[] {
  return buildAgentRuntimeBaseVolumes(ensureAgentRuntimeHostPaths(agentId))
}

export function buildAgentRuntimeVolumes(agentId: string, baseVolumes: RuntimeVolumeSpec[]): RuntimeVolumeSpec[] {
  const configuredMounts = agentRuntimeMountStore.resolveAgentRuntimeVolumeMounts(agentId)
  return [
    ...baseVolumes,
    ...configuredMounts.map((mount) => ({
      hostPath: mount.hostPath,
      guestPath: mount.guestPath,
      readOnly: mount.readOnly,
    })),
  ]
}

export function __buildAgentRuntimeVolumesForTests(
  agentId: string,
  baseVolumes: RuntimeVolumeSpec[],
): RuntimeVolumeSpec[] {
  return buildAgentRuntimeVolumes(agentId, baseVolumes)
}
