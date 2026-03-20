/**
 * Test-only Hono app with REST routes mounted.
 *
 * Production `app` (server.ts) no longer mounts REST routes — agents use
 * /ws/agent RPC exclusively. Tests that exercise REST endpoints should
 * import `app` from this module instead of from server.ts.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { channelsApi } from '../src/api/channels.js'
import { agentsApi } from '../src/api/agents.js'
import { messagesApi } from '../src/api/messages.js'
import { sandboxesApi } from '../src/api/sandboxes.js'
import { todosApi } from '../src/api/todos.js'
import { settingsApi } from '../src/api/settings.js'
import { mediaApi } from '../src/api/media.js'
import { adminHostOperatorApi } from '../src/api/admin-host-operator.js'

export const app = new Hono()
app.use('/*', cors())

app.onError((err, c) => {
  const msg = err.message || 'Internal Server Error'
  if (msg.includes('UNIQUE constraint')) return c.json({ error: 'Already exists' }, 409)
  if (msg.includes('FOREIGN KEY constraint')) return c.json({ error: 'Referenced resource not found' }, 400)
  if (err instanceof SyntaxError && (msg.includes('JSON') || msg.includes('Unexpected'))) return c.json({ error: 'Invalid JSON body' }, 400)
  console.error('Unhandled error:', err)
  return c.json({ error: msg }, 500)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/api/channels', channelsApi)
app.route('/api/agents', agentsApi)
app.route('/api/messages', messagesApi)
app.route('/api/sandboxes', sandboxesApi)
app.route('/api/todos', todosApi)
app.route('/api/settings', settingsApi)
app.route('/api/media', mediaApi)

export const adminApp = new Hono()
adminApp.use('/*', cors())
adminApp.route('/api/admin', adminHostOperatorApi)
