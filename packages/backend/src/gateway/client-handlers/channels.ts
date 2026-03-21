import type { Handler, CallContext } from '../protocol.js'
import * as broadcast from '../broadcast.js'
import * as channelStore from '../../storage/channel-store.js'
import * as messageStore from '../../storage/message-store.js'
import * as agentStore from '../../storage/agent-store.js'
import { onNewMessage } from '../../agents/orchestrator.js'
import { parseMentions } from '../../utils/mentions.js'

export function registerChannelHandlers(h: (method: string, fn: Handler) => void): void {
  h('channels.list', async () => {
    return channelStore.listChannels()
  })

  h('channels.create', async (params) => {
    const name = typeof params.name === 'string' ? params.name.trim() : ''
    if (!name) throw new Error('Channel name is required')
    const creatorId = typeof params.creatorId === 'string' ? params.creatorId.trim() || undefined : undefined
    const channel = channelStore.createChannel({ name, description: params.description as string | undefined, creatorId })
    broadcast.sendToAll({ type: 'workspace:invalidate', payload: { resources: ['channels'], reason: 'created' } })
    return channel
  })

  h('channels.get', async (params) => {
    const channel = channelStore.getChannel(params.id as string)
    if (!channel) throw new Error('not_found')
    return channel
  })

  h('channels.getByName', async (params) => {
    const channel = channelStore.getChannelByName(params.name as string)
    if (!channel) throw new Error('not_found')
    return channel
  })

  h('channels.update', async (params) => {
    const { id, ...data } = params as Record<string, unknown>
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !(data.name as string).trim()) throw new Error('Channel name cannot be empty')
      data.name = (data.name as string).trim()
    }
    const channel = channelStore.updateChannel(id as string, data)
    if (!channel) throw new Error('not_found')
    broadcast.sendToAll({ type: 'workspace:invalidate', payload: { resources: ['channels'], reason: 'updated' } })
    return channel
  })

  h('channels.delete', async (params) => {
    const ok = channelStore.deleteChannel(params.id as string)
    if (!ok) throw new Error('not_found')
    broadcast.sendToAll({ type: 'workspace:invalidate', payload: { resources: ['channels'], reason: 'deleted' } })
    return { ok: true }
  })

  h('channels.getMessages', async (params) => {
    const limit = Number(params.limit || 50)
    const before = params.before ? Number(params.before) : undefined
    return messageStore.getChannelMessages(params.channelId as string, limit, before)
  })

  h('channels.sendMessage', async (params) => {
    const channelId = params.channelId as string
    const content = typeof params.content === 'string' ? params.content.trim() : ''
    const authorId = params.authorId as string
    if (!content) throw new Error('Message content is required')
    if (!authorId) throw new Error('Author ID is required')

    const channel = channelStore.getChannel(channelId)
    if (!channel) throw new Error('not_found')

    const authorAgent = agentStore.getAgent(authorId)
    if (authorAgent && !channelStore.isAgentSubscribed(authorAgent.id, channelId)) {
      throw new Error(`Agent "${authorAgent.name}" is not in this channel.`)
    }

    const agents = agentStore.listAgents()
    const mentionedIds = parseMentions(content, agents)
    const message = messageStore.createMessage(channelId, authorId, content, mentionedIds)
    onNewMessage(message).catch(err => console.error('Orchestrator error:', err))
    return message
  })

  h('channels.subscribe', async (params) => {
    const agentId = params.agentId as string
    const channelId = params.channelId as string
    if (!agentId) throw new Error('agentId is required')
    if (!agentStore.getAgent(agentId)) throw new Error('not_found')
    if (!channelStore.getChannel(channelId)) throw new Error('not_found')
    channelStore.subscribeAgent(agentId, channelId)
    return { ok: true }
  })

  h('channels.unsubscribe', async (params) => {
    channelStore.unsubscribeAgent(params.agentId as string, params.channelId as string)
    return { ok: true }
  })

  h('channels.getSubscribers', async (params) => {
    return channelStore.getChannelSubscribers(params.channelId as string)
  })
}
