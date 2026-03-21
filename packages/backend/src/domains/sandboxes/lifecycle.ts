import type {
  BoxCreateRequest,
  BoxListResponse,
  BoxPatchRequest,
  BoxResource,
  BoxStatusResponse,
} from '@dune/shared'
import * as sandboxStore from '../../storage/sandbox-store.js'
import * as agentStore from '../../storage/agent-store.js'
import * as agentRuntimeStore from '../../storage/agent-runtime-store.js'
import {
  destroyRuntimeSandbox,
  listRunningAgentSandboxes,
  stopRuntimeSandbox,
} from '../agents/runtime-sandbox.js'
import { activeBySandboxId, withSandboxLock } from './runtime-state.js'
import { isSystemActor, canAccessManagedRuntime, assertOperatePermission, canReadPersistedSandbox, canReadAgentManaged, ensureSandboxMetadataMutability } from './acl.js'
import { sandboxToResource, agentManagedToResource, ensureManagedRuntimeShadow, resolveBox } from './resource.js'
import { startBox, startBoxUnlocked } from './exec-helpers.js'
import { statusOrder } from './path-helpers.js'
import type { ActorIdentity, AgentManagedSandbox } from './types.js'

async function listAgentManagedBoxes(): Promise<AgentManagedSandbox[]> {
  return listRunningAgentSandboxes()
}

export async function listBoxes(identity: ActorIdentity): Promise<BoxListResponse> {
  const persisted = sandboxStore.listSandboxes()
  const persistedVisible = persisted
    .filter((sandbox) => !sandbox.managedByAgent)
    .filter((sandbox) => canReadPersistedSandbox(identity, sandbox))
    .map((sandbox) => sandboxToResource(sandbox, sandboxStore.listSandboxAcl(sandbox.id)))

  const managedPersisted = sandboxStore.listManagedRuntimeSandboxes(10_000)
  const managedById = new Map<string, AgentManagedSandbox>()
  const managedLive = await listAgentManagedBoxes()
  for (const managed of managedLive) {
    managedById.set(managed.sandboxId, managed)
    ensureManagedRuntimeShadow(managed)
  }

  const managedVisible: BoxResource[] = []
  for (const sandbox of managedPersisted) {
    if (!canAccessManagedRuntime(identity, sandbox.managedAgentId)) continue
    const live = managedById.get(sandbox.id)
    const resource = sandboxToResource(sandbox, sandboxStore.listSandboxAcl(sandbox.id))
    if (live) {
      resource.status = live.status
      resource.startedAt = live.startedAt
      resource.stoppedAt = live.status === 'running' ? null : Date.now()
      if (!resource.name) resource.name = live.name
    }
    managedVisible.push(resource)
  }

  for (const managed of managedLive) {
    if (managedPersisted.some((row) => row.id === managed.sandboxId)) continue
    if (!canReadAgentManaged(identity, managed)) continue
    managedVisible.push(agentManagedToResource(managed))
  }

  const boxes = [...persistedVisible, ...managedVisible]
    .sort((a, b) => {
      const w = statusOrder(a.status) - statusOrder(b.status)
      if (w !== 0) return w
      return b.updatedAt - a.updatedAt
    })

  return {
    boxes,
    nextPageToken: null,
  }
}

export async function createBox(identity: ActorIdentity, req: BoxCreateRequest): Promise<BoxResource> {
  const sandbox = sandboxStore.createSandbox(req, identity.actorType, identity.actorId)
  const acl = sandboxStore.listSandboxAcl(sandbox.id)
  return sandboxToResource(sandbox, acl)
}

export async function getBox(identity: ActorIdentity, boxId: string): Promise<BoxResource | null> {
  return resolveBox(identity, boxId)
}

export async function patchBox(identity: ActorIdentity, boxId: string, patch: BoxPatchRequest): Promise<BoxResource | null> {
  return withSandboxLock(boxId, async () => {
    const existing = await resolveBox(identity, boxId)
    if (!existing) return null
    ensureSandboxMetadataMutability(identity, existing)
    assertOperatePermission(identity, boxId)

    const current = sandboxStore.getSandbox(boxId)
    if (!current) return null

    if (patch.acl) {
      sandboxStore.setSandboxAcl(boxId, [
        { sandboxId: boxId, principalType: current.creatorType, principalId: current.creatorId, permission: 'operate' },
        { sandboxId: boxId, principalType: current.creatorType, principalId: current.creatorId, permission: 'read' },
        ...patch.acl.map((entry) => ({
          sandboxId: boxId,
          principalType: entry.principalType,
          principalId: entry.principalId,
          permission: entry.permission,
        })),
      ])
    }

    const updated = sandboxStore.updateSandbox(boxId, {
      name: patch.name !== undefined ? (patch.name?.trim() || null) : undefined,
      labels: patch.labels,
      autoRemove: patch.autoRemove,
      durability: patch.durability,
    })
    if (!updated) return null
    return sandboxToResource(updated, sandboxStore.listSandboxAcl(boxId))
  })
}

export async function deleteBox(identity: ActorIdentity, boxId: string, force = false): Promise<boolean> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) return false
    if (box._dune.managedByAgent && isSystemActor(identity)) {
      await destroyRuntimeSandbox(boxId)
      sandboxStore.deleteManagedRuntimeSandbox(boxId)
      return true
    }

    ensureSandboxMetadataMutability(identity, box)
    assertOperatePermission(identity, boxId)

    const active = activeBySandboxId.get(boxId)
    if (active && !force) throw new Error('box_running')
    if (active) {
      try { await active.box.stop() } catch {}
      activeBySandboxId.delete(boxId)
    }
    return sandboxStore.deleteSandbox(boxId)
  })
}

export { startBox }

export async function stopBox(identity: ActorIdentity, boxId: string): Promise<{ removed: boolean; box: BoxResource | null }> {
  return withSandboxLock(boxId, async () => {
    const existing = await resolveBox(identity, boxId)
    if (!existing) return { removed: false, box: null }
    if (existing._dune.managedByAgent && isSystemActor(identity)) {
      await stopRuntimeSandbox(boxId)
      const refreshed = await resolveBox(identity, boxId)
      return { removed: false, box: refreshed }
    }

    ensureSandboxMetadataMutability(identity, existing)
    assertOperatePermission(identity, boxId)

    const runtimeEntry = activeBySandboxId.get(boxId)
    if (runtimeEntry) {
      try { await runtimeEntry.box.stop() } catch {}
      activeBySandboxId.delete(boxId)
    }

    const sandbox = sandboxStore.getSandbox(boxId)
    if (!sandbox) return { removed: false, box: null }

    if (sandbox.durability === 'ephemeral' || sandbox.autoRemove) {
      sandboxStore.deleteSandbox(boxId)
      return { removed: true, box: null }
    }

    const updated = sandboxStore.updateSandbox(boxId, {
      status: 'stopped',
      stoppedAt: Date.now(),
    })
    if (!updated) return { removed: false, box: null }
    return { removed: false, box: sandboxToResource(updated, sandboxStore.listSandboxAcl(boxId)) }
  })
}

export async function getBoxStatus(identity: ActorIdentity, boxId: string): Promise<BoxStatusResponse | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  return {
    boxId: box.boxId,
    status: box.status,
    startedAt: box.startedAt,
    stoppedAt: box.stoppedAt,
  }
}

export async function reconcileSandboxesOnStartup(): Promise<void> {
  const now = Date.now()
  const sandboxes = sandboxStore.listSandboxes(10_000)
  for (const sandbox of sandboxes) {
    if (sandbox.managedByAgent) continue
    if (sandbox.status === 'running' || sandbox.status === 'stopping' || sandbox.status === 'creating') {
      if (sandbox.durability === 'ephemeral' || sandbox.autoRemove) {
        sandboxStore.deleteSandbox(sandbox.id)
      } else {
        sandboxStore.updateSandbox(sandbox.id, {
          status: 'stopped',
          stoppedAt: now,
        })
      }
    }
  }

  const runtimeStates = agentRuntimeStore.listAgentRuntimeStates(10_000)
  const desiredManaged = new Set<string>()
  for (const runtimeState of runtimeStates) {
    if (!runtimeState.sandboxId) continue
    const agent = agentStore.getAgent(runtimeState.agentId)
    if (!agent) continue

    const sandboxId = runtimeState.sandboxId
    if (sandboxId.startsWith('pending:')) continue
    desiredManaged.add(sandboxId)

    sandboxStore.upsertManagedRuntimeSandbox({
      sandboxId,
      agentId: runtimeState.agentId,
      name: `${agent.name} runtime`,
      status: 'stopped',
      startedAt: runtimeState.lastStartedAt ?? runtimeState.createdAt,
      stoppedAt: runtimeState.lastStoppedAt ?? now,
      boxliteBoxId: sandboxId,
    })
  }

  const managedRows = sandboxStore.listManagedRuntimeSandboxes(10_000)
  for (const managed of managedRows) {
    if (!desiredManaged.has(managed.id)) {
      sandboxStore.deleteManagedRuntimeSandbox(managed.id)
    }
  }
}

export async function stopAllSandboxes(): Promise<void> {
  const ids = Array.from(activeBySandboxId.keys())
  await Promise.all(ids.map(async (id) => {
    await withSandboxLock(id, async () => {
      const active = activeBySandboxId.get(id)
      if (!active) return
      try { await active.box.stop() } catch {}
      activeBySandboxId.delete(id)
      const sandbox = sandboxStore.getSandbox(id)
      if (!sandbox) return
      if (sandbox.durability === 'ephemeral' || sandbox.autoRemove) {
        sandboxStore.deleteSandbox(id)
      } else {
        sandboxStore.updateSandbox(id, { status: 'stopped', stoppedAt: Date.now() })
      }
    })
  }))
}
