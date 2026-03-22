import type { HandlerMap, Handler } from '../protocol.js'
import { registerChannelHandlers } from './channels.js'
import { registerMessageHandlers } from './messages.js'
import { registerAgentHandlers } from './agents.js'
import { registerMountHandlers } from './mounts.js'
import { registerMemoryHandlers } from './memory.js'
import { registerMailboxHandlers } from './mailbox.js'
import { registerAppHandlers } from './apps.js'
import { registerHostOpsHandlers } from './host-ops.js'
import { registerTodoHandlers } from './todos.js'
import { registerSettingsHandlers } from './settings.js'
import { registerAdminHandlers } from './admin.js'
import { registerSandboxHandlers } from './sandboxes.js'
import { registerSlackHandlers } from './slack.js'
import { registerMediaHandlers } from './media.js'

export function buildClientHandlers(): HandlerMap {
  const handlers: HandlerMap = new Map<string, Handler>()
  const h = (method: string, fn: Handler) => handlers.set(method, fn)

  registerChannelHandlers(h)
  registerMessageHandlers(h)
  registerAgentHandlers(h)
  registerMountHandlers(h)
  registerMemoryHandlers(h)
  registerMailboxHandlers(h)
  registerAppHandlers(h)
  registerHostOpsHandlers(h)
  registerTodoHandlers(h)
  registerSettingsHandlers(h)
  registerAdminHandlers(h)
  registerSandboxHandlers(h)
  registerSlackHandlers(h)
  registerMediaHandlers(h)

  return handlers
}
