import type { Handler } from '../protocol.js'
import { emit } from '../events.js'
import * as agentStore from '../../storage/agent-store.js'
import * as agentLogStore from '../../storage/agent-log-store.js'
import * as channelStore from '../../storage/channel-store.js'
import { destroyAgentRuntimeSandbox } from '../../domains/agents/runtime-sandbox.js'
import { ensureAgentRunning, stopAgent, interruptAgentWorkflow, cancelStartup } from '../../domains/agents/lifecycle.js'
import { reconcileAllRunningCommunicationDaemons, redeployAllDaemons } from '../../domains/agents/daemon-sync.js'
import { isAgentRunning } from '../../domains/agents/runtime-state.js'
import { listSkills, assembleSystemPrompt } from '../../domains/agents/prompt-builder.js'
import { takeScreenshot, getAgentScreen, debugExec } from '../../domains/agents/screen.js'
import { sendMessage } from '../../domains/agents/messaging.js'
import * as hostOperatorService from '../../domains/host/computer-use-service.js'
import { config } from '../../config.js'
import {
  normalizeAgentRole,
  normalizeAgentWorkMode,
  normalizeClaudeModelId,
  normalizeHostOperatorApprovalMode,
  normalizeStringArray,
  START_ALL_MAX_CONCURRENCY,
  START_ALL_TIMEOUT_GRACE_MS,
} from './validation.js'

export function registerAgentHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.list', async () => {
    return agentStore.listAgents()
  })

  h('agents.create', async (params) => {
    const name = typeof params.name === 'string' ? params.name.trim() : ''
    const personality = typeof params.personality === 'string' ? params.personality.trim() : ''
    if (!name) throw new Error('Agent name is required')
    if (!personality) throw new Error('Agent personality is required')

    const body: Record<string, unknown> = { name, personality }
    if (params.role !== undefined) body.role = normalizeAgentRole(params.role)
    if (params.workMode !== undefined) body.workMode = normalizeAgentWorkMode(params.workMode)
    if (params.modelIdOverride !== undefined) body.modelIdOverride = normalizeClaudeModelId(params.modelIdOverride)
    if (params.avatarColor !== undefined) body.avatarColor = params.avatarColor

    const agent = agentStore.createAgent(body as any)
    const general = channelStore.getChannelByName('general')
    if (general) channelStore.subscribeAgent(agent.id, general.id)
    emit({ type: 'workspace:invalidate', payload: { resources: ['agents'], reason: 'created' } })
    return agent
  })

  h('agents.get', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return agent
  })

  h('agents.getByName', async (params) => {
    const agent = agentStore.getAgentByName(params.name as string)
    if (!agent) throw new Error('not_found')
    return agent
  })

  h('agents.update', async (params) => {
    const { id, ...body } = params as Record<string, unknown>
    const existing = agentStore.getAgent(id as string)
    if (!existing) throw new Error('not_found')

    const nextBody: Record<string, unknown> = { ...body }
    if ('hostOperatorApprovalMode' in body) nextBody.hostOperatorApprovalMode = normalizeHostOperatorApprovalMode(body.hostOperatorApprovalMode)
    if ('hostOperatorApps' in body) nextBody.hostOperatorApps = normalizeStringArray(body.hostOperatorApps, 'invalid_host_operator_apps')
    if ('hostOperatorPaths' in body) nextBody.hostOperatorPaths = normalizeStringArray(body.hostOperatorPaths, 'invalid_host_operator_paths')
    if ('role' in body) nextBody.role = normalizeAgentRole(body.role)
    if ('workMode' in body) nextBody.workMode = normalizeAgentWorkMode(body.workMode)
    if ('modelIdOverride' in body) nextBody.modelIdOverride = normalizeClaudeModelId(body.modelIdOverride)
    if ('keepAlive' in body) nextBody.keepAlive = !!body.keepAlive

    const agent = agentStore.updateAgent(id as string, nextBody as any)
    if (!agent) throw new Error('not_found')
    if (existing.hostOperatorApprovalMode !== 'dangerously-skip' && agent.hostOperatorApprovalMode === 'dangerously-skip') {
      await hostOperatorService.autoApprovePendingHostOperatorRequestsForAgent(agent)
    }
    emit({ type: 'workspace:invalidate', payload: { resources: ['agents'], reason: 'updated' } })
    return agent
  })

  h('agents.delete', async (params) => {
    const agentId = params.id as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    await destroyAgentRuntimeSandbox(agentId)
    const ok = agentStore.deleteAgent(agentId)
    if (!ok) throw new Error('not_found')
    emit({ type: 'workspace:invalidate', payload: { resources: ['agents'], reason: 'deleted' } })
    return { ok: true }
  })

  h('agents.start', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    await ensureAgentRunning(agent.id)
    emit({ type: 'agent:status', payload: { agentId: agent.id, status: 'idle' } })
    return { ok: true, status: 'idle' }
  })

  h('agents.stop', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    await stopAgent(agent.id)
    emit({ type: 'agent:status', payload: { agentId: agent.id, status: 'stopped' } })
    return { ok: true, status: 'stopped' }
  })

  h('agents.interrupt', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const interrupted = await interruptAgentWorkflow(agent.id)
    const status = agentStore.getAgent(agent.id)?.status || agent.status
    return { ok: true, interrupted, status }
  })

  h('agents.cancelStart', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const cancelled = cancelStartup(agent.id)
    if (!cancelled) throw new Error('No startup in progress')
    return { ok: true }
  })

  h('agents.startAll', async () => {
    const agents = agentStore.listAgents()
    const general = channelStore.getChannelByName('general')
    if (general) {
      for (const agent of agents) channelStore.subscribeAgent(agent.id, general.id)
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
            ensureAgentRunning(agent.id),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => reject(new Error(`startup_timeout: exceeded ${startupTimeoutMs}ms`)), startupTimeoutMs)
              ;(timeoutHandle as any).unref()
            }),
          ])
          emit({ type: 'agent:status', payload: { agentId: agent.id, status: 'idle' } })
          results[index] = { id: agent.id, name: agent.name, status: 'idle' }
        } catch (err: any) {
          const errorMessage = err?.message || 'unknown startup failure'
          if (errorMessage.startsWith('startup_timeout:')) cancelStartup(agent.id)
          results[index] = { id: agent.id, name: agent.name, status: 'error', error: errorMessage }
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle)
        }
      }
    })
    await Promise.all(workers)
    void reconcileAllRunningCommunicationDaemons().catch((err: any) => {
      console.warn(`[agents/start-all] reconcile daemons failed: ${err?.message || err}`)
    })
    return results
  })

  h('agents.stopAll', async () => {
    const agents = agentStore.listAgents()
    for (const agent of agents) {
      if (isAgentRunning(agent.id)) {
        await stopAgent(agent.id)
        emit({ type: 'agent:status', payload: { agentId: agent.id, status: 'stopped' } })
      }
    }
    return { ok: true }
  })

  h('agents.redeployDaemons', async () => {
    await redeployAllDaemons()
    return { ok: true }
  })

  h('agents.getSubscriptions', async (params) => {
    return channelStore.getAgentSubscriptions(params.id as string)
  })

  h('agents.getSkills', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return listSkills(agent)
  })

  h('agents.getSystemPrompt', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return { prompt: assembleSystemPrompt(agent.id) }
  })

  h('agents.getLogs', async (params) => {
    const rawLimit = Number(params.limit ?? 200)
    const limit = Number.isFinite(rawLimit) ? rawLimit : 200
    let beforeSeq: number | undefined
    if (params.beforeSeq !== undefined) {
      const parsed = Number(params.beforeSeq)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('beforeSeq must be a positive number')
      beforeSeq = Math.trunc(parsed)
    }
    return agentLogStore.getAgentLogs(params.id as string, { limit, beforeSeq })
  })

  h('agents.getScreenshot', async (params) => {
    return takeScreenshot(params.id as string)
  })

  h('agents.getScreen', async (params) => {
    const screen = getAgentScreen(params.id as string)
    if (!screen) throw new Error('not_found')
    return screen
  })

  h('agents.exec', async (params) => {
    return debugExec(params.id as string, params.cmd as string, (params.args as string[]) || [])
  })

  h('agents.dm', async (params) => {
    const agentId = params.agentId as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    if (!isAgentRunning(agentId)) throw new Error('Agent not running')
    const content = typeof params.content === 'string' ? params.content.trim() : ''
    if (!content) throw new Error('content required')
    const clientRequestId = typeof params.clientRequestId === 'string' ? params.clientRequestId.trim() : ''
    const response = await sendMessage(agentId, [{ authorName: 'User', content }], {
      source: 'dm',
      content,
      clientRequestId: clientRequestId || undefined,
    })
    return { response }
  })
}
