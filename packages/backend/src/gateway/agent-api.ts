import type { HandlerMap, Handler, CallContext } from './protocol.js'
import { clientHandlers } from './client-api.js'

// ── Agent Handler Map ─────────────────────────────────────────────────
// Agents get all client methods except a small blocklist.

const BLOCKED_AGENT_METHODS = new Set([
  // Host Operator — requires human approval flow, agents must not self-serve
  'agents.submitHostOperator',
  'agents.getHostOperator',
  'agents.listGrants',
  'agents.upsertGrant',
  'agents.deleteGrant',
])

export const agentHandlers: HandlerMap = new Map<string, Handler>()

for (const [method, handler] of clientHandlers) {
  if (!BLOCKED_AGENT_METHODS.has(method)) {
    agentHandlers.set(method, handler)
  }
}
