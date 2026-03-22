import './domains/agents/_init.js'
import { getDb } from './storage/database.js'
import { resetAllStatuses } from './storage/agent-store.js'
import { reconcileSandboxesOnStartup } from './domains/sandboxes/lifecycle.js'
import { startServer } from './server.js'

// Initialize database and reset agent statuses (containers are lost on restart)
getDb()
resetAllStatuses()
await reconcileSandboxesOnStartup()

// Start server
await startServer()
