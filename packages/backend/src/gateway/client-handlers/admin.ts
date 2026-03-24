import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import * as hostOperatorService from '../../domains/host/computer-use-service.js'

export function registerAdminHandlers(h: (method: string, fn: Handler) => void): void {
  h('admin.listPendingHostOp', async () => {
    return { requests: hostOperatorService.listPendingHostOperatorRequests(500) }
  })

  h('admin.decideHostOp', async (params) => {
    const decision = params.decision as string
    if (decision !== 'approve' && decision !== 'reject') throw new Error('invalid_decision')
    const grantTtlMs = typeof params.grantTtlMs === 'number' && params.grantTtlMs > 0 ? params.grantTtlMs : undefined
    const decided = await hostOperatorService.decideHostOperatorRequest({
      requestId: params.requestId as string,
      decision: decision as 'approve' | 'reject',
      approverId: 'admin',
      grantTtlMs,
      agentLookup: (agentId) => agentStore.getAgent(agentId),
    })
    if (!decided) throw new Error('not_found')
    return decided
  })

  h('admin.listHostOpApps', async () => {
    return { apps: await hostOperatorService.listRunningHostOperatorApps() }
  })
}
