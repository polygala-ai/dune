import type { HandlerMap, Handler, CallContext } from './protocol.js'
import { clientHandlers } from './client-api.js'

// ── Agent Handler Map ─────────────────────────────────────────────────
// Explicit allowlist of methods agents can call on /ws/agent.

const ALLOWED_AGENT_METHODS = new Set([
  // Channels
  'channels.list',
  'channels.create',
  'channels.get',
  'channels.getByName',
  'channels.getMessages',
  'channels.sendMessage',
  'channels.subscribe',

  // Agents
  'agents.list',
  'agents.create',
  'agents.get',
  'agents.start',
  'agents.stop',
  'agents.getMailbox',
  'agents.fetchMailbox',
  'agents.ackMailbox',
  'agents.respond',
  'agents.submitHostOperator',
  'agents.getHostOperator',

  // Todos
  'todos.list',
  'todos.create',
  'todos.update',
  'todos.delete',

  // Sandboxes
  'sandboxes.listBoxes',
  'sandboxes.createBox',
  'sandboxes.getBox',
  'sandboxes.patchBox',
  'sandboxes.deleteBox',
  'sandboxes.startBox',
  'sandboxes.stopBox',
  'sandboxes.getBoxStatus',
  'sandboxes.createExec',
  'sandboxes.listExecs',
  'sandboxes.getExec',
  'sandboxes.getExecEvents',
  'sandboxes.uploadFiles',
  'sandboxes.downloadFile',
  'sandboxes.importHostPath',
  'sandboxes.listFs',
  'sandboxes.readFs',
  'sandboxes.mkdirFs',
  'sandboxes.moveFs',
  'sandboxes.deleteFs',

  // Slack
  'slack.getSettings',
  'slack.updateSettings',
  'slack.disconnect',
  'slack.syncAgent',
  'slack.unsyncAgent',
  'slack.sendMessage',
  'slack.sendImage',

  // Media
  'media.uploadImage',
])

export const agentHandlers: HandlerMap = new Map<string, Handler>()

for (const [method, handler] of clientHandlers) {
  if (ALLOWED_AGENT_METHODS.has(method)) {
    agentHandlers.set(method, handler)
  }
}
