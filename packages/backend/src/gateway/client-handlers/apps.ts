import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import * as miniappStore from '../../storage/miniapp-store.js'
import * as agentManager from '../../agents/agent-manager.js'
import * as sandboxManager from '../../sandboxes/sandbox-manager.js'
import { isNoResponse } from './validation.js'

async function openAppImpl(agentId: string, slug: string) {
  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error('not_found')
  const app = miniappStore.getMiniApp(agent.id, slug)
  if (!app) throw new Error('not_found')
  if (!app.openable) throw new Error(app.error || 'Miniapp is not openable')

  if (app.sandboxId && app.port != null) {
    const systemActor = { actorType: 'system' as const, actorId: 'agent-apps' }
    let box = await sandboxManager.getBox(systemActor, app.sandboxId)
    if (!box) throw new Error(`Sandbox "${app.sandboxId}" not found`)
    if (box.status === 'stopped') {
      box = await sandboxManager.startBox(systemActor, app.sandboxId)
      if (!box) throw new Error(`Failed to start sandbox "${app.sandboxId}"`)
    }
    const portMapping = box.ports?.find((p: any) => p.guestPort === app.port)
    if (!portMapping?.hostPort) throw new Error(`Port ${app.port} not mapped on sandbox "${app.sandboxId}"`)
    return { app, url: `http://localhost:${portMapping.hostPort}${app.path || '/'}` }
  }

  const screen = await agentManager.ensureAgentRunning(agent.id)
  await agentManager.ensureMiniappNginxConfigured(agent.id)
  const encodedEntry = app.entry.split('/').map((segment: string) => encodeURIComponent(segment)).join('/')
  return { app, url: `http://localhost:${screen.guiHttpPort}/miniapps/${encodeURIComponent(app.slug)}/${encodedEntry}` }
}

export function registerAppHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.listApps', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    return miniappStore.listMiniApps(agent.id)
  })

  h('agents.listAllApps', async () => {
    const agents = agentStore.listAgents()
    const allApps = []
    for (const agent of agents) {
      const apps = miniappStore.listMiniApps(agent.id)
      for (const app of apps) allApps.push({ ...app, agentName: agent.name })
    }
    return allApps
  })

  h('agents.openApp', async (params) => {
    return openAppImpl(params.agentId as string, params.slug as string)
  })

  h('agents.openAppCrossAgent', async (params) => {
    return openAppImpl(params.agentId as string, params.slug as string)
  })

  h('agents.appAction', async (params) => {
    const agentId = params.agentId as string
    const slug = params.slug as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    const app = miniappStore.getMiniApp(agent.id, slug)
    if (!app) throw new Error('not_found')
    if (!app.openable) throw new Error(app.error || 'Miniapp is not openable')

    const action = typeof params.action === 'string' ? params.action.trim() : ''
    const requestId = typeof params.requestId === 'string' ? params.requestId : undefined
    if (!action) throw new Error('action required')

    await agentManager.ensureAgentRunning(agent.id)
    const actionPrompt = [
      'Miniapp action request from Dune host:',
      `App slug: ${app.slug}`,
      `App name: ${app.name}`,
      `Action: ${action}`,
      `Request ID: ${requestId || 'none'}`,
      `Payload JSON: ${JSON.stringify(params.payload ?? null)}`,
      'Return only the action result for the host. Prefer a concise JSON string when structure is useful.',
      'Do not post this result to any channel.',
    ].join('\n')

    const response = await Promise.race([
      agentManager.sendMessage(agentId, [{ authorName: 'System', content: actionPrompt }], {
        source: 'app_action',
        appAction: { slug: app.slug, action, payload: params.payload, requestId },
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('[TIMEOUT]'), 90_000)),
    ])
    if (response === '[TIMEOUT]') throw new Error('Action timed out')
    if (isNoResponse(response)) throw new Error('Agent returned no response')
    return { ok: true, response, requestId }
  })
}
