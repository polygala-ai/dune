import type { BoxResource } from '@dune/shared'
import * as sandboxStore from '../../storage/sandbox-store.js'
import type { ActorIdentity, AgentManagedSandbox } from './types.js'

export function isSystemActor(identity: ActorIdentity): boolean {
  return identity.actorType === 'system'
}

export function canAccessManagedRuntime(identity: ActorIdentity, agentId: string | null): boolean {
  if (isSystemActor(identity) || identity.actorType === 'human') return true
  return identity.actorType === 'agent' && !!agentId && identity.actorId === agentId
}

export function assertReadPermission(identity: ActorIdentity, sandboxId: string): void {
  if (isSystemActor(identity) || identity.actorType === 'human') return
  if (!sandboxStore.hasSandboxPermission(sandboxId, identity.actorType, identity.actorId, 'read')) {
    throw new Error('forbidden')
  }
}

export function assertOperatePermission(identity: ActorIdentity, sandboxId: string): void {
  if (isSystemActor(identity) || identity.actorType === 'human') return
  if (!sandboxStore.hasSandboxPermission(sandboxId, identity.actorType, identity.actorId, 'operate')) {
    throw new Error('forbidden')
  }
}

export function canReadPersistedSandbox(identity: ActorIdentity, sandbox: sandboxStore.StoredSandbox): boolean {
  if (isSystemActor(identity)) return true
  return sandboxStore.hasSandboxPermission(sandbox.id, identity.actorType, identity.actorId, 'read')
}

export function canReadAgentManaged(identity: ActorIdentity, box: AgentManagedSandbox): boolean {
  return canAccessManagedRuntime(identity, box.agentId)
}

export function ensureSandboxMutability(identity: ActorIdentity, box: BoxResource): void {
  if (isSystemActor(identity)) return
  if (identity.actorType === 'human') {
    // Humans can do file ops on managed sandboxes, but not if explicitly readOnly
    if (box._dune.readOnly) {
      throw new Error('managed_by_agent_lifecycle')
    }
    return
  }
  // Agent and other actors: blocked on both managed and readOnly sandboxes
  if (box._dune.managedByAgent || box._dune.readOnly) {
    throw new Error('managed_by_agent_lifecycle')
  }
}

/** Stricter check: blocks humans on managed-by-agent sandboxes (for metadata mutations like patch/stop). */
export function ensureSandboxMetadataMutability(identity: ActorIdentity, box: BoxResource): void {
  if (isSystemActor(identity)) return
  if (box._dune.managedByAgent || box._dune.readOnly) {
    throw new Error('managed_by_agent_lifecycle')
  }
}

export function canAutoStartRuntime(identity: ActorIdentity, box: BoxResource): boolean {
  return box._dune.managedByAgent && (isSystemActor(identity) || identity.actorType === 'human')
}

export function ensureBoxRunning(identity: ActorIdentity, box: BoxResource): void {
  if (canAutoStartRuntime(identity, box)) return
  if (box.status !== 'running') {
    throw new Error('box_not_running')
  }
}
