import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adminHostOperatorApi } from './api/admin-host-operator.js'
import { startSlackConnection, stopSlackConnection } from './slack/slack-connection.js'
import { setupAgentGateway, setupClientGateway } from './gateway/transport.js'
import { reloadTimers } from './todos/todo-timer.js'
import { stopAllAgents, closeRuntime } from './agents/agent-manager.js'
import { stopAllSandboxes, closeSandboxRuntime } from './sandboxes/sandbox-manager.js'
import { config } from './config.js'
import { findFreePort } from './utils/port-finder.js'
import {
  startAgentLogRetentionSweepScheduler,
  stopAgentLogRetentionSweepScheduler,
} from './storage/agent-log-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDistAbsolutePath = resolve(config.frontendDistPath)
const frontendDistRoot = relative(process.cwd(), frontendDistAbsolutePath) || '.'
const hasFrontendBuild = existsSync(join(frontendDistAbsolutePath, 'index.html'))
const mediaAbsolutePath = resolve(join(config.dataRoot, 'media'))
const mediaRoot = relative(process.cwd(), mediaAbsolutePath) || '.'

// ── Agent App (/ws/agent + terminal) ──────────────────────────────────

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

// Agent REST routes removed — agents use /ws/agent RPC exclusively.

// Serve uploaded media files
app.use('/media/*', serveStatic({ root: mediaRoot, rewriteRequestPath: (p) => p.replace('/media', '') }))

// ── Client App (SPA + /ws/client) ─────────────────────────────────────

export const clientApp = new Hono()
clientApp.use('/*', cors())
clientApp.get('/health', (c) => c.json({ status: 'ok' }))

// Serve uploaded media files
clientApp.use('/media/*', serveStatic({ root: mediaRoot, rewriteRequestPath: (p) => p.replace('/media', '') }))

function isReservedFrontendPath(path: string): boolean {
  return path === '/api'
    || path.startsWith('/api/')
    || path === '/ws'
    || path.startsWith('/ws/')
}

function isSpaRoute(path: string): boolean {
  if (isReservedFrontendPath(path)) return false
  const lastSegment = basename(path)
  return !lastSegment.includes('.')
}

if (hasFrontendBuild) {
  const staticMiddleware = serveStatic({ root: frontendDistRoot })
  const indexMiddleware = serveStatic({ root: frontendDistRoot, path: 'index.html' })

  clientApp.use('*', async (c, next) => {
    if (isReservedFrontendPath(c.req.path)) return next()
    return staticMiddleware(c, next)
  })

  clientApp.get('*', async (c, next) => {
    if (!isSpaRoute(c.req.path)) return next()
    return indexMiddleware(c, next)
  })
}

// ── Admin App ─────────────────────────────────────────────────────────

export const adminApp = new Hono()
adminApp.use('/*', cors())
adminApp.route('/api/admin', adminHostOperatorApi)

// ── Port allocation ───────────────────────────────────────────────────

const PORT_RANGE_START = 20000
const portFilePath = join(__dirname, '../.port')

/** Read previously allocated ports so restarts reuse the same ports. */
function readPreviousPorts(): { agentPort: number; clientPort: number; adminPort: number } | null {
  try {
    const raw = readFileSync(portFilePath, 'utf-8').trim()
    if (!raw.startsWith('{')) return null
    const parsed = JSON.parse(raw)
    if (parsed.agentPort > 0 && parsed.clientPort > 0 && parsed.adminPort > 0) return parsed
  } catch {}
  return null
}

async function resolvePort(configured: number, previous?: number): Promise<number> {
  if (configured > 0) return configured
  if (previous && previous > 0) {
    try {
      await findFreePort(previous, 1)
      return previous
    } catch {
      // Previous port occupied, fall back to random
    }
  }
  return findFreePort(PORT_RANGE_START + Math.floor(Math.random() * 30000))
}

// ── Start ─────────────────────────────────────────────────────────────

export async function startServer() {
  const prev = readPreviousPorts()
  const agentPort = await resolvePort(config.port, prev?.agentPort)
  const resolvedClientPort = await resolvePort(config.clientPort, prev?.clientPort)
  const resolvedAdminPort = await resolvePort(config.adminPort, prev?.adminPort)

  // Server A: Agent gateway (REST + /ws/agent + terminal)
  const agentServer = serve({ fetch: app.fetch, port: agentPort }, (info) => {
    console.log(`Dune agent gateway listening on port ${info.port}`)
  })
  ;(agentServer as any).on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') { console.error(`Agent port ${agentPort} is already in use.`); process.exit(1) }
  })
  setupAgentGateway(agentServer as any)

  // Server B: Client gateway (SPA + /ws/client)
  const clientServer = serve({ fetch: clientApp.fetch, port: resolvedClientPort }, (info) => {
    console.log(`Dune client gateway listening on port ${info.port}`)
    if (hasFrontendBuild) console.log(`Serving frontend from ${frontendDistAbsolutePath}`)
  })
  ;(clientServer as any).on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') { console.error(`Client port ${resolvedClientPort} is already in use.`); process.exit(1) }
  })
  setupClientGateway(clientServer as any)

  // Server C: Admin (localhost only)
  const adminServer = serve({
    fetch: adminApp.fetch,
    port: resolvedAdminPort,
    hostname: '127.0.0.1',
  }, (info) => {
    console.log(`Dune admin plane listening on 127.0.0.1:${info.port}`)
  })
  ;(adminServer as any).on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') { console.error(`Admin port ${resolvedAdminPort} is already in use.`); process.exit(1) }
  })

  // Write port file (JSON format) for frontend dev server and agent-manager
  try {
    writeFileSync(
      join(__dirname, '../.port'),
      JSON.stringify({ agentPort, clientPort: resolvedClientPort, adminPort: resolvedAdminPort }),
    )
  } catch {}

  // Notify parent process (Electron sidecar)
  if (process.send) {
    process.send({ type: 'listening', port: agentPort, clientPort: resolvedClientPort, adminPort: resolvedAdminPort })
  }

  reloadTimers()
  startAgentLogRetentionSweepScheduler()
  startSlackConnection().catch(err => console.warn('Slack auto-connect failed:', err))

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...')
    stopAgentLogRetentionSweepScheduler()

    // Close servers first — await so OS releases ports before process exits
    await Promise.allSettled([
      new Promise<void>((resolve) => agentServer.close(() => resolve())),
      new Promise<void>((resolve) => clientServer.close(() => resolve())),
      new Promise<void>((resolve) => adminServer.close(() => resolve())),
    ])

    await stopSlackConnection()
    await stopAllSandboxes()
    await stopAllAgents()
    closeSandboxRuntime()
    closeRuntime()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return { server: agentServer, clientServer, adminServer }
}
