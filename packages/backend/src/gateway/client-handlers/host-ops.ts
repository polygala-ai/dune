import type { Handler, CallContext } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import * as hostOperatorService from '../../domains/host/gui-service.js'
import * as hostGrantStore from '../../storage/host-grant-store.js'
import type { HostOperatorCreateRequest } from '@dune/shared'

export function registerHostOpsHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.submitHostOperator', async (params, ctx) => {
    const agentId = params.id as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')

    if (ctx.actor.actorType !== 'system' || ctx.actor.actorId !== `agent:${agentId}`) {
      throw new Error('forbidden')
    }

    const { id: _id, ...requestBody } = params
    const created = await hostOperatorService.submitHostOperatorRequest({
      agent,
      requestedByType: ctx.actor.actorType,
      requestedById: ctx.actor.actorId,
      request: requestBody as HostOperatorCreateRequest,
      approvalMode: agent.hostOperatorApprovalMode,
    })
    const finalState = await hostOperatorService.waitForTerminalHostOperatorRequest(created.requestId)
    if (!finalState) throw new Error('not_found')
    return finalState
  })

  h('agents.getHostOperator', async (params, ctx) => {
    const request = hostOperatorService.getHostOperatorRequest(params.requestId as string)
    if (!request) throw new Error('not_found')
    const isOwnerAgent = ctx.actor.actorType === 'system' && ctx.actor.actorId === `agent:${request.agentId}`
    const isAdminHuman = ctx.actor.actorType === 'human' && ctx.actor.actorId === 'admin'
    if (!isOwnerAgent && !isAdminHuman) throw new Error('forbidden')
    return request
  })

  h('agents.listGrants', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return hostGrantStore.listGrantsForAgent(agent.id)
  })

  h('agents.upsertGrant', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const kind = params.kind as 'app' | 'path'
    if (kind !== 'app' && kind !== 'path') throw new Error('kind must be app or path')
    const target = typeof params.target === 'string' ? params.target.trim() : ''
    if (!target) throw new Error('target required')
    const expiresAt = typeof params.expiresAt === 'number' ? params.expiresAt : null
    hostGrantStore.upsertGrant(agent.id, kind, target, expiresAt)
    return { ok: true }
  })

  h('agents.deleteGrant', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const kind = params.kind as 'app' | 'path'
    const target = params.target as string
    const deleted = hostGrantStore.deleteGrant(agent.id, kind, target)
    if (!deleted) throw new Error('not_found')
    return { ok: true }
  })
}
