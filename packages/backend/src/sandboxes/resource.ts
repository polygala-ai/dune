import type { BoxResource, SandboxAclEntry } from '@dune/shared'
import * as sandboxStore from '../storage/sandbox-store.js'
import { activeBySandboxId } from './runtime-state.js'
import { isSystemActor, canAccessManagedRuntime, assertReadPermission, canReadPersistedSandbox, canReadAgentManaged } from './acl.js'
import { listRunningAgentSandboxes } from '../agents/agent-manager.js'
import type { ActorIdentity, AgentManagedSandbox } from './types.js'

export function sandboxToResource(
  sandbox: sandboxStore.StoredSandbox,
  acl: SandboxAclEntry[],
): BoxResource {
  const active = activeBySandboxId.get(sandbox.id)
  const runtimePorts = active
    ? sandbox.ports.map((port) => ({
      ...port,
      hostPort: active.hostPortsByGuest.get(port.guestPort) ?? port.hostPort,
    }))
    : sandbox.ports

  return {
    boxId: sandbox.id,
    name: sandbox.name,
    status: sandbox.status,
    createdAt: sandbox.createdAt,
    updatedAt: sandbox.updatedAt,
    startedAt: sandbox.startedAt,
    stoppedAt: sandbox.stoppedAt,
    image: sandbox.image,
    cpus: sandbox.cpus,
    memoryMib: sandbox.memoryMib,
    diskSizeGb: sandbox.diskSizeGb,
    workingDir: sandbox.workingDir,
    env: sandbox.env,
    entrypoint: sandbox.entrypoint,
    cmd: sandbox.cmd,
    user: sandbox.user,
    volumes: sandbox.volumes,
    ports: runtimePorts,
    labels: sandbox.labels,
    autoRemove: sandbox.autoRemove,
    detach: sandbox.detach,
    durability: sandbox.durability,
    _dune: {
      ownership: {
        creatorType: sandbox.creatorType,
        creatorId: sandbox.creatorId,
        readOnly: sandbox.readOnly,
        readOnlyReason: sandbox.readOnlyReason,
      },
      sharedWith: acl,
      readOnly: sandbox.readOnly,
      readOnlyReason: sandbox.readOnlyReason,
      managedByAgent: sandbox.managedByAgent,
      agentId: sandbox.managedAgentId,
    },
  }
}

export function agentManagedToResource(box: AgentManagedSandbox): BoxResource {
  const now = Date.now()
  return {
    boxId: box.sandboxId,
    name: box.name,
    status: box.status === 'running' ? 'running' : 'stopped',
    createdAt: box.startedAt,
    updatedAt: now,
    startedAt: box.startedAt,
    stoppedAt: box.status === 'running' ? null : now,
    image: 'ghcr.io/boxlite-ai/boxlite-skillbox:0.1.0',
    cpus: 2,
    memoryMib: 2048,
    diskSizeGb: 10,
    workingDir: '/workspace',
    env: {},
    entrypoint: [],
    cmd: [],
    user: null,
    volumes: [],
    ports: [],
    labels: { kind: 'agent-runtime' },
    autoRemove: false,
    detach: false,
    durability: 'persistent',
    _dune: {
      ownership: {
        creatorType: 'system',
        creatorId: 'agents-runtime',
        readOnly: true,
        readOnlyReason: 'managed_by_agent_lifecycle',
      },
      sharedWith: [],
      readOnly: true,
      readOnlyReason: 'managed_by_agent_lifecycle',
      managedByAgent: true,
      agentId: box.agentId,
    },
  }
}

export function ensureManagedRuntimeShadow(managed: AgentManagedSandbox): sandboxStore.StoredSandbox {
  const existing = sandboxStore.getSandbox(managed.sandboxId)
  if (existing && existing.managedByAgent) {
    return sandboxStore.upsertManagedRuntimeSandbox({
      sandboxId: managed.sandboxId,
      agentId: managed.agentId,
      status: managed.status,
      startedAt: managed.startedAt,
      stoppedAt: managed.status === 'running' ? null : Date.now(),
      boxliteBoxId: managed.sandboxId,
    })
  }

  return sandboxStore.upsertManagedRuntimeSandbox({
    sandboxId: managed.sandboxId,
    agentId: managed.agentId,
    name: managed.name,
    status: managed.status,
    startedAt: managed.startedAt,
    stoppedAt: managed.status === 'running' ? null : Date.now(),
    boxliteBoxId: managed.sandboxId,
  })
}

async function listAgentManagedBoxes(): Promise<AgentManagedSandbox[]> {
  return listRunningAgentSandboxes()
}

export async function resolveBox(identity: ActorIdentity, boxId: string): Promise<BoxResource | null> {
  const stored = sandboxStore.getSandbox(boxId)
  if (stored) {
    if (stored.managedByAgent && !canAccessManagedRuntime(identity, stored.managedAgentId)) {
      throw new Error('forbidden')
    }
    if (!stored.managedByAgent) {
      assertReadPermission(identity, boxId)
    } else if (!isSystemActor(identity) && !canReadPersistedSandbox(identity, stored)) {
      // Keep previous behavior: managed runtime boxes are visible to human / owning agent.
      // Read-only operations still require explicit allowance.
    }
    return sandboxToResource(stored, sandboxStore.listSandboxAcl(boxId))
  }

  const managed = (await listAgentManagedBoxes()).find((item) => item.sandboxId === boxId)
  if (managed) {
    if (!canReadAgentManaged(identity, managed)) throw new Error('forbidden')
    const shadow = ensureManagedRuntimeShadow(managed)
    return sandboxToResource(shadow, sandboxStore.listSandboxAcl(shadow.id))
  }

  return null
}
