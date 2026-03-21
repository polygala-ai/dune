import { Hono } from 'hono'
import * as agentStore from '../storage/agent-store.js'
import * as channelStore from '../storage/channel-store.js'
import * as agentLogStore from '../storage/agent-log-store.js'
import * as miniappStore from '../storage/miniapp-store.js'
import * as agentManager from '../agents/agent-manager.js'
import * as mailboxService from '../mailbox/mailbox-service.js'
import * as hostOperatorService from '../host-operator/host-operator-service.js'
import { config } from '../config.js'
import { sendToAll as broadcastAll } from '../gateway/broadcast.js'
import * as sandboxManager from '../sandboxes/sandbox-manager.js'
import type { AgentRoleType, HostOperatorCreateRequest } from '@dune/shared'
import { agentsMemoryApi } from './agents-memory.js'
import { agentsMountsApi } from './agents-mounts.js'
import {
  isNoResponse,
  readOptionalJsonBody,
  normalizeHostOperatorApprovalMode,
  normalizeStringArray,
  normalizeAgentRole,
  normalizeAgentWorkMode,
  normalizeClaudeModelId,
  parseActor,
  mapHostOperatorErrorToResponse,
  getEnsureAgentRunningImpl,
  __setEnsureAgentRunningForTests,
  __setPickHostDirectoryForTests,
} from './agents-validation.js'

export { __setEnsureAgentRunningForTests, __setPickHostDirectoryForTests }

export const agentsApi = new Hono()

function getAgentMaps() {
  const allAgents = agentStore.listAgents()
  return {
    allAgents,
    agentMap: new Map(allAgents.map((agent) => [agent.id, agent])),
  }
}

function getAuthorName(agentMap: Map<string, { name: string }>, authorId: string): string {
  return agentMap.get(authorId)?.name || (authorId === 'system' ? 'System' : 'User')
}

function buildChannelInputMetadata(
  agentMap: Map<string, { name: string }>,
  channels: mailboxService.MailboxChannelMessages[],
): agentManager.InputMetadata {
  return {
    source: 'channel',
    channels: channels.map((channel) => ({
      name: channel.channelName,
      messages: channel.messages.map((message) => ({
        author: getAuthorName(agentMap, message.authorId),
        content: message.content,
      })),
    })),
  }
}

function buildMailboxPrompt(unreadCount: number): string {
  const label = unreadCount === 1 ? 'message' : 'messages'
  return [
    `You have ${unreadCount} unread ${label} in your mailbox.`,
    'Use the mailbox endpoints on the local Dune proxy to inspect the unread batch yourself.',
    'After you respond, or decide nothing needs a reply, acknowledge the fetched batch.',
    'Do not fetch channel history unless you intentionally want older context.',
  ].join('\n')
}

function appendTeamRoster(promptParts: string[], allAgents: Array<{ id: string; name: string; personality: string; role: AgentRoleType }>, agentId: string): void {
  const otherAgents = allAgents.filter((agent) => agent.id !== agentId)
  if (otherAgents.length === 0) return
  const roster = otherAgents.map((agent) => `${agent.name} [${agent.role}] (${agent.personality.split('.')[0]})`).join(', ')
  promptParts.push(`[Team members: ${roster}]`)
}

const START_ALL_MAX_CONCURRENCY = 4
const START_ALL_TIMEOUT_GRACE_MS = 2_000

// ── Mount sub-routes ──────────────────────────────────────────────────
agentsApi.route('/', agentsMountsApi)

// ── Memory sub-routes ─────────────────────────────────────────────────
agentsApi.route('/', agentsMemoryApi)

// ── Agent CRUD ────────────────────────────────────────────────────────

agentsApi.get('/by-name/:name', (c) => {
  const agent = agentStore.getAgentByName(c.req.param('name'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(agent)
})

agentsApi.get('/', (c) => {
  return c.json(agentStore.listAgents())
})

agentsApi.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Agent name is required' }, 400)
  }
  if (!body.personality || typeof body.personality !== 'string' || !body.personality.trim()) {
    return c.json({ error: 'Agent personality is required' }, 400)
  }
  body.name = body.name.trim()
  body.personality = body.personality.trim()
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    try {
      body.role = normalizeAgentRole(body.role)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_agent_role') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'workMode')) {
    try {
      body.workMode = normalizeAgentWorkMode(body.workMode)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_agent_work_mode') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'modelIdOverride')) {
    try {
      body.modelIdOverride = normalizeClaudeModelId(body.modelIdOverride)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_model_id') }, 400)
    }
  }
  let agent
  try {
    agent = agentStore.createAgent(body)
  } catch (err: any) {
    if (err?.message?.includes('already exists')) return c.json({ error: err.message }, 409)
    throw err
  }
  // Auto-subscribe new agents to #general
  const general = channelStore.getChannelByName('general')
  if (general) {
    channelStore.subscribeAgent(agent.id, general.id)
  }
  broadcastAll({
    type: 'workspace:invalidate',
    payload: { resources: ['agents'], reason: 'created' },
  })
  return c.json(agent, 201)
})

// ── Batch operations (must be before /:id routes) ─────────────────────

agentsApi.post('/start-all', async (c) => {
  const agents = agentStore.listAgents()
  // Backfill: ensure all agents are subscribed to #general
  const general = channelStore.getChannelByName('general')
  if (general) {
    for (const agent of agents) {
      channelStore.subscribeAgent(agent.id, general.id)
    }
  }
  const results: Array<{ id: string; name: string; status: string; error?: string }> = new Array(agents.length)
  const startupTimeoutMs = Math.max(1_000, config.agentStartupTimeoutMs) + START_ALL_TIMEOUT_GRACE_MS
  const startQueue: Array<{ index: number; agent: (typeof agents)[number] }> = []

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index]
    if (agent.status !== 'stopped') {
      results[index] = { id: agent.id, name: agent.name, status: agent.status }
      continue
    }
    startQueue.push({ index, agent })
  }

  let cursor = 0
  const workerCount = Math.min(START_ALL_MAX_CONCURRENCY, startQueue.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = cursor
      cursor += 1
      if (currentIndex >= startQueue.length) break
      const { index, agent } = startQueue[currentIndex]

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      try {
        await Promise.race([
          getEnsureAgentRunningImpl()(agent.id),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`startup_timeout: exceeded ${startupTimeoutMs}ms`))
            }, startupTimeoutMs)
            timeoutHandle.unref()
          }),
        ])
        broadcastAll({ type: 'agent:status', payload: { agentId: agent.id, status: 'idle' } })
        results[index] = { id: agent.id, name: agent.name, status: 'idle' }
      } catch (err: any) {
        const errorMessage = err?.message || 'unknown startup failure'
        if (errorMessage.startsWith('startup_timeout:')) {
          agentManager.cancelStartup(agent.id)
        }
        results[index] = { id: agent.id, name: agent.name, status: 'error', error: errorMessage }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    }
  })

  await Promise.all(workers)
  // BoxLite breaks guest->host networking when new containers start.
  // Reconcile daemons on running agents with fresh network detection.
  void agentManager.reconcileAllRunningCommunicationDaemons().catch((err: any) => {
    console.warn(`[agents/start-all] reconcile daemons failed: ${err?.message || err}`)
  })
  return c.json(results)
})

agentsApi.post('/redeploy-daemons', async (c) => {
  await agentManager.redeployAllDaemons()
  return c.json({ ok: true })
})

agentsApi.post('/stop-all', async (c) => {
  const agents = agentStore.listAgents()
  for (const agent of agents) {
    if (agentManager.isAgentRunning(agent.id)) {
      await agentManager.stopAgent(agent.id)
      broadcastAll({ type: 'agent:status', payload: { agentId: agent.id, status: 'stopped' } })
    }
  }
  return c.json({ ok: true })
})

// ── Host Operator (main plane request/status only) ───────────────────

agentsApi.post('/:id/host-operator', async (c) => {
  try {
    const agentId = c.req.param('id')
    const agent = agentStore.getAgent(agentId)
    if (!agent) return c.json({ error: 'not_found' }, 404)

    const actor = parseActor(c)
    if (actor.actorType !== 'system' || actor.actorId !== `agent:${agentId}`) {
      throw new Error('forbidden')
    }

    const body = await c.req.json() as HostOperatorCreateRequest
    const created = await hostOperatorService.submitHostOperatorRequest({
      agent,
      requestedByType: actor.actorType,
      requestedById: actor.actorId,
      request: body,
      approvalMode: agent.hostOperatorApprovalMode,
    })

    const finalState = await hostOperatorService.waitForTerminalHostOperatorRequest(created.requestId)
    if (!finalState) return c.json({ error: 'not_found' }, 404)
    return c.json(finalState)
  } catch (err: any) {
    return mapHostOperatorErrorToResponse(c, err)
  }
})

agentsApi.get('/host-operator/:requestId', async (c) => {
  try {
    const actor = parseActor(c)
    const request = hostOperatorService.getHostOperatorRequest(c.req.param('requestId'))
    if (!request) return c.json({ error: 'not_found' }, 404)

    const isOwnerAgent = actor.actorType === 'system' && actor.actorId === `agent:${request.agentId}`
    const isAdminHuman = actor.actorType === 'human' && actor.actorId === 'admin'
    if (!isOwnerAgent && !isAdminHuman) {
      throw new Error('forbidden')
    }

    return c.json(request)
  } catch (err: any) {
    return mapHostOperatorErrorToResponse(c, err)
  }
})

agentsApi.post('/:id/host-commands', async (c) => {
  return c.json({ error: 'host_exec_removed' }, 410)
})

agentsApi.get('/host-commands/:requestId', async (c) => {
  return c.json({ error: 'host_exec_removed' }, 410)
})

// ── Centralized Apps endpoint ────────────────────────────────────────

agentsApi.get('/apps/all', (c) => {
  const agents = agentStore.listAgents()
  const allApps = []
  for (const agent of agents) {
    const apps = miniappStore.listMiniApps(agent.id)
    for (const app of apps) {
      allApps.push({ ...app, agentName: agent.name })
    }
  }
  return c.json(allApps)
})

// Cross-agent app access (any caller can open/action any agent's app)
agentsApi.post('/apps/:agentId/:slug/open', async (c) => {
  const agentId = c.req.param('agentId')
  const slug = c.req.param('slug')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const app = miniappStore.getMiniApp(agent.id, slug)
  if (!app) return c.json({ error: 'Miniapp not found' }, 404)
  if (!app.openable) return c.json({ error: app.error || 'Miniapp is not openable' }, 400)

  try {
    // Cross-sandbox deployment: app specifies sandboxId + port
    if (app.sandboxId && app.port != null) {
      const systemActor = { actorType: 'system' as const, actorId: 'agent-apps' }
      let box = await sandboxManager.getBox(systemActor, app.sandboxId)
      if (!box) return c.json({ error: `Sandbox "${app.sandboxId}" not found` }, 404)

      // Auto-start the sandbox if stopped
      if (box.status === 'stopped') {
        box = await sandboxManager.startBox(systemActor, app.sandboxId)
        if (!box) return c.json({ error: `Failed to start sandbox "${app.sandboxId}"` }, 500)
      }

      // Find the host port mapping for the app's guest port
      const portMapping = box.ports?.find((p: any) => p.guestPort === app.port)
      if (!portMapping?.hostPort) {
        return c.json({ error: `Port ${app.port} not mapped on sandbox "${app.sandboxId}"` }, 400)
      }

      const url = `http://localhost:${portMapping.hostPort}${app.path || '/'}`
      return c.json({ app, url })
    }

    // Default: SkillBox-based deployment via agent runtime
    const screen = await agentManager.ensureAgentRunning(agent.id)
    await agentManager.ensureMiniappNginxConfigured(agent.id)
    const encodedEntry = app.entry.split('/').map((segment: string) => encodeURIComponent(segment)).join('/')
    const url = `http://localhost:${screen.guiHttpPort}/miniapps/${encodeURIComponent(app.slug)}/${encodedEntry}`
    return c.json({ app, url })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/apps/:agentId/:slug/action', async (c) => {
  const agentId = c.req.param('agentId')
  const slug = c.req.param('slug')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const app = miniappStore.getMiniApp(agent.id, slug)
  if (!app) return c.json({ ok: false, error: 'Miniapp not found' }, 404)
  if (!app.openable) return c.json({ ok: false, error: app.error || 'Miniapp is not openable' }, 400)

  const body = await c.req.json()
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const requestId = typeof body.requestId === 'string' ? body.requestId : undefined
  const payload = body.payload

  if (!action) return c.json({ ok: false, error: 'action required', requestId }, 400)

  try {
    await agentManager.ensureAgentRunning(agent.id)
    const actionPrompt = [
      'Miniapp action request from Dune host:',
      `App slug: ${app.slug}`,
      `App name: ${app.name}`,
      `Action: ${action}`,
      `Request ID: ${requestId || 'none'}`,
      `Payload JSON: ${JSON.stringify(payload ?? null)}`,
      'Return only the action result for the host. Prefer a concise JSON string when structure is useful.',
      'Do not post this result to any channel.',
    ].join('\n')

    const response = await Promise.race([
      agentManager.sendMessage(
        agent.id,
        [{ authorName: 'System', content: actionPrompt }],
        {
          source: 'app_action',
          appAction: { slug: app.slug, action, payload, requestId },
        },
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('[TIMEOUT]'), 90_000)),
    ])

    if (response === '[TIMEOUT]') {
      return c.json({ ok: false, error: 'Action timed out', requestId }, 504)
    }
    if (isNoResponse(response)) {
      return c.json({ ok: false, error: 'Agent returned no response', requestId }, 502)
    }
    return c.json({ ok: true, response, requestId })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message, requestId }, 500)
  }
})

// ── Agent Miniapps (must be before /:id routes) ─────────────────────

agentsApi.get('/:id/apps', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(miniappStore.listMiniApps(agent.id))
})

agentsApi.post('/:id/apps/:slug/open', async (c) => {
  const agentId = c.req.param('id')
  const slug = c.req.param('slug')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const app = miniappStore.getMiniApp(agent.id, slug)
  if (!app) return c.json({ error: 'Miniapp not found' }, 404)
  if (!app.openable) return c.json({ error: app.error || 'Miniapp is not openable' }, 400)

  try {
    // Cross-sandbox deployment: app specifies sandboxId + port
    if (app.sandboxId && app.port != null) {
      const systemActor = { actorType: 'system' as const, actorId: 'agent-apps' }
      let box = await sandboxManager.getBox(systemActor, app.sandboxId)
      if (!box) return c.json({ error: `Sandbox "${app.sandboxId}" not found` }, 404)

      if (box.status === 'stopped') {
        box = await sandboxManager.startBox(systemActor, app.sandboxId)
        if (!box) return c.json({ error: `Failed to start sandbox "${app.sandboxId}"` }, 500)
      }

      const portMapping = box.ports?.find((p: any) => p.guestPort === app.port)
      if (!portMapping?.hostPort) {
        return c.json({ error: `Port ${app.port} not mapped on sandbox "${app.sandboxId}"` }, 400)
      }

      const url = `http://localhost:${portMapping.hostPort}${app.path || '/'}`
      return c.json({ app, url })
    }

    // Default: SkillBox-based deployment via agent runtime
    const screen = await agentManager.ensureAgentRunning(agent.id)
    await agentManager.ensureMiniappNginxConfigured(agent.id)
    const encodedEntry = app.entry.split('/').map((segment: string) => encodeURIComponent(segment)).join('/')
    const url = `http://localhost:${screen.guiHttpPort}/miniapps/${encodeURIComponent(app.slug)}/${encodedEntry}`
    return c.json({ app, url })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/:id/apps/:slug/action', async (c) => {
  const agentId = c.req.param('id')
  const slug = c.req.param('slug')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ ok: false, error: 'Not found' }, 404)

  const app = miniappStore.getMiniApp(agent.id, slug)
  if (!app) return c.json({ ok: false, error: 'Miniapp not found' }, 404)
  if (!app.openable) return c.json({ ok: false, error: app.error || 'Miniapp is not openable' }, 400)

  const body = await c.req.json()
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const requestId = typeof body.requestId === 'string' ? body.requestId : undefined
  const payload = body.payload

  if (!action) return c.json({ ok: false, error: 'action required', requestId }, 400)

  try {
    await agentManager.ensureAgentRunning(agent.id)
    const actionPrompt = [
      'Miniapp action request from Dune host:',
      `App slug: ${app.slug}`,
      `App name: ${app.name}`,
      `Action: ${action}`,
      `Request ID: ${requestId || 'none'}`,
      `Payload JSON: ${JSON.stringify(payload ?? null)}`,
      'Return only the action result for the host. Prefer a concise JSON string when structure is useful.',
      'Do not post this result to any channel.',
    ].join('\n')

    const response = await Promise.race([
      agentManager.sendMessage(
        agent.id,
        [{ authorName: 'System', content: actionPrompt }],
        {
          source: 'app_action',
          appAction: { slug: app.slug, action, payload, requestId },
        },
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('[TIMEOUT]'), 90_000)),
    ])

    if (response === '[TIMEOUT]') {
      return c.json({ ok: false, error: 'Action timed out', requestId }, 504)
    }
    if (isNoResponse(response)) {
      return c.json({ ok: false, error: 'Agent returned no response', requestId }, 502)
    }
    return c.json({ ok: true, response, requestId })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message, requestId }, 500)
  }
})

// ── Agent Skills & System Prompt ─────────────────────────────────────

agentsApi.get('/:id/skills', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(agentManager.listSkills(agent))
})

agentsApi.get('/:id/system-prompt', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  try {
    const prompt = agentManager.assembleSystemPrompt(agent.id)
    return c.json({ prompt })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── Single Agent CRUD ────────────────────────────────────────────────

agentsApi.get('/:id', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(agent)
})

agentsApi.put('/:id', async (c) => {
  const body = await c.req.json()
  const existing = agentStore.getAgent(c.req.param('id'))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const normalizedBody = body && typeof body === 'object' ? body : {}
  const nextBody = { ...normalizedBody }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'hostOperatorApprovalMode')) {
    try {
      nextBody.hostOperatorApprovalMode = normalizeHostOperatorApprovalMode((normalizedBody as Record<string, unknown>).hostOperatorApprovalMode)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_host_operator_approval_mode') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'hostOperatorApps')) {
    try {
      nextBody.hostOperatorApps = normalizeStringArray((normalizedBody as Record<string, unknown>).hostOperatorApps, 'invalid_host_operator_apps')
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_host_operator_apps') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'hostOperatorPaths')) {
    try {
      nextBody.hostOperatorPaths = normalizeStringArray((normalizedBody as Record<string, unknown>).hostOperatorPaths, 'invalid_host_operator_paths')
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_host_operator_paths') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'role')) {
    try {
      nextBody.role = normalizeAgentRole((normalizedBody as Record<string, unknown>).role)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_agent_role') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'workMode')) {
    try {
      nextBody.workMode = normalizeAgentWorkMode((normalizedBody as Record<string, unknown>).workMode)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_agent_work_mode') }, 400)
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedBody, 'modelIdOverride')) {
    try {
      nextBody.modelIdOverride = normalizeClaudeModelId((normalizedBody as Record<string, unknown>).modelIdOverride)
    } catch (err: any) {
      return c.json({ error: String(err?.message || 'invalid_model_id') }, 400)
    }
  }

  let agent
  try {
    agent = agentStore.updateAgent(c.req.param('id'), nextBody)
  } catch (err: any) {
    if (err?.message?.includes('already exists')) return c.json({ error: err.message }, 409)
    throw err
  }
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (
    existing.hostOperatorApprovalMode !== 'dangerously-skip'
    && agent.hostOperatorApprovalMode === 'dangerously-skip'
  ) {
    await hostOperatorService.autoApprovePendingHostOperatorRequestsForAgent(agent)
  }
  broadcastAll({
    type: 'workspace:invalidate',
    payload: { resources: ['agents'], reason: 'updated' },
  })
  return c.json(agent)
})

agentsApi.delete('/:id', async (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)

  await agentManager.destroyAgentRuntimeSandbox(agentId)
  const ok = agentStore.deleteAgent(agentId)
  if (!ok) return c.json({ error: 'Not found' }, 404)
  broadcastAll({
    type: 'workspace:invalidate',
    payload: { resources: ['agents'], reason: 'deleted' },
  })
  return c.json({ ok: true })
})

// ── Agent Lifecycle ──────────────────────────────────────────────────

agentsApi.post('/:id/start', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  try {
    await agentManager.ensureAgentRunning(agent.id)
    broadcastAll({ type: 'agent:status', payload: { agentId: agent.id, status: 'idle' } })
    return c.json({ ok: true, status: 'idle' })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/:id/stop', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  try {
    await agentManager.stopAgent(agent.id)
    broadcastAll({ type: 'agent:status', payload: { agentId: agent.id, status: 'stopped' } })
    return c.json({ ok: true, status: 'stopped' })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/:id/interrupt', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  try {
    const interrupted = await agentManager.interruptAgentWorkflow(agent.id)
    const status = agentStore.getAgent(agent.id)?.status || agent.status
    return c.json({ ok: true, interrupted, status })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/:id/cancel-start', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  const cancelled = agentManager.cancelStartup(agent.id)
  if (!cancelled) return c.json({ error: 'No startup in progress' }, 400)
  return c.json({ ok: true })
})

agentsApi.get('/:id/subscriptions', (c) => {
  return c.json(channelStore.getAgentSubscriptions(c.req.param('id')))
})

agentsApi.get('/:id/logs', (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 200)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 200

  const beforeSeqQuery = c.req.query('beforeSeq')
  let beforeSeq: number | undefined
  if (beforeSeqQuery !== undefined) {
    const parsed = Number(beforeSeqQuery)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return c.json({ error: 'beforeSeq must be a positive number' }, 400)
    }
    beforeSeq = Math.trunc(parsed)
  }

  return c.json(agentLogStore.getAgentLogs(c.req.param('id'), { limit, beforeSeq }))
})

agentsApi.get('/:id/screenshot', async (c) => {
  try {
    const screenshot = await agentManager.takeScreenshot(c.req.param('id'))
    return c.json(screenshot)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.post('/:id/exec', async (c) => {
  try {
    const body = await c.req.json()
    const result = await agentManager.debugExec(c.req.param('id'), body.cmd, body.args || [])
    return c.json(result)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

agentsApi.get('/:id/screen', (c) => {
  const screen = agentManager.getAgentScreen(c.req.param('id'))
  if (!screen) return c.json({ error: 'Agent not running' }, 404)
  return c.json(screen)
})

// ── Agent Communication ────────────────────────────────────────────────

agentsApi.get('/:id/mailbox', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(mailboxService.getMailboxSummary(agent.id))
})

agentsApi.post('/:id/mailbox/fetch', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(mailboxService.fetchMailbox(agent.id))
})

agentsApi.post('/:id/mailbox/ack', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json()
  const batchId = typeof body.batchId === 'string' ? body.batchId.trim() : ''
  if (!batchId) return c.json({ error: 'batchId required' }, 400)
  const result = mailboxService.ackMailboxBatch(agent.id, batchId)
  if (!result.found) return c.json({ error: 'Batch not found' }, 404)
  return c.json({ ok: true })
})

agentsApi.get('/:id/unread', (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(mailboxService.listLegacyUnreadChannels(agent.id))
})

agentsApi.post('/:id/ack', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  const { channelId, timestamp } = await c.req.json()
  if (!channelId || typeof timestamp !== 'number') return c.json({ error: 'channelId and numeric timestamp required' }, 400)
  agentStore.setReadCursor(agent.id, channelId, timestamp)
  return c.json({ ok: true })
})

agentsApi.post('/:id/respond', async (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (!agentManager.isAgentRunning(agentId)) return c.json({ error: 'Agent not running' }, 400)

  const body = await readOptionalJsonBody(c)

  if (body && !Array.isArray(body) && body.mode === 'mailbox') {
    const lease = mailboxService.ensureMailboxLease(agentId)
    if (!lease) return c.json({ ok: true, response: '' })

    try {
      const response = await agentManager.sendMessage(
        agentId,
        [{ authorName: 'System', content: buildMailboxPrompt(lease.messageCount) }],
        {
          source: 'mailbox',
          mailbox: {
            unreadCount: lease.messageCount,
            batchId: lease.batchId,
            expiresAt: lease.expiresAt,
          },
        },
      )
      return c.json({ ok: true, response })
    } catch (err: any) {
      mailboxService.expireMailboxBatch(agentId, lease.batchId)
      return c.json({ error: err.message }, 500)
    }
  }

  const unreadChannels = Array.isArray(body) ? body as mailboxService.MailboxChannelMessages[] : null
  if (!unreadChannels || unreadChannels.length === 0) return c.json({ ok: true, response: '' })

  // Format unread messages as a prompt for the agent
  const { allAgents, agentMap } = getAgentMaps()
  const allAgentIds = new Set(allAgents.map((agentRow) => agentRow.id))

  // Filter out channels where ALL messages are agent-to-agent chatter (no user input)
  // and none @mention this agent — avoids endless agent conversation loops
  const relevantChannels = unreadChannels.filter((channel) => {
    const hasUserMessage = channel.messages.some((message) => !allAgentIds.has(message.authorId) && message.authorId !== 'system')
    const mentionsMe = channel.messages.some((message) =>
      Array.isArray(message.mentionedAgentIds) && message.mentionedAgentIds.includes(agentId)
    )
    return hasUserMessage || mentionsMe
  })

  if (relevantChannels.length === 0) {
    // Still ack cursors to avoid re-processing these messages
    for (const channel of unreadChannels) {
      const lastMessage = channel.messages[channel.messages.length - 1]
      if (lastMessage) agentStore.setReadCursor(agentId, channel.channelId, lastMessage.timestamp)
    }
    return c.json({ ok: true, response: '[NO_RESPONSE]' })
  }

  const promptParts: string[] = ['You have new messages in your channels:\n']

  for (const channel of relevantChannels) {
    promptParts.push(`--- #${channel.channelName} ---`)
    for (const message of channel.messages) {
      promptParts.push(`${getAuthorName(agentMap, message.authorId)}: ${message.content}`)
    }
    promptParts.push('')
  }

  // Include teammate roster so agent knows who to @mention
  appendTeamRoster(promptParts, allAgents, agentId)

  promptParts.push('Read the messages above. If any are directed at you or relevant, respond using curl to send a message. If nothing requires your attention, reply with exactly: [NO_RESPONSE]')

  const contextMessages = [{ authorName: 'System', content: promptParts.join('\n') }]

  // Ack all channels up to their latest message BEFORE calling CLI.
  // This prevents infinite retry loops if the agent consistently fails on a message.
  for (const channel of unreadChannels) {
    const lastMessage = channel.messages[channel.messages.length - 1]
    if (lastMessage) {
      agentStore.setReadCursor(agentId, channel.channelId, lastMessage.timestamp)
    }
  }

  try {
    const response = await agentManager.sendMessage(
      agentId,
      contextMessages,
      buildChannelInputMetadata(agentMap, relevantChannels),
    )

    // If agent responded (not [NO_RESPONSE]), the response was sent via curl through the proxy
    // The CLI's text output here is just the agent's "thinking" — actual messages go through the proxy
    return c.json({ ok: true, response })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Direct message — send a prompt directly to an agent (from DM chat view)
agentsApi.post('/:id/dm', async (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (!agentManager.isAgentRunning(agentId)) return c.json({ error: 'Agent not running' }, 400)

  const body = await c.req.json()
  const content = body.content?.trim()
  const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.trim() : ''
  if (!content) return c.json({ error: 'content required' }, 400)

  try {
    const response = await agentManager.sendMessage(agentId, [{ authorName: 'User', content }], {
      source: 'dm',
      content,
      clientRequestId: clientRequestId || undefined,
    })
    return c.json({ response })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})
