import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import { isAgentRunning } from '../../domains/agents/runtime-state.js'
import { sendMessage } from '../../domains/agents/messaging.js'
import * as mailboxService from '../../domains/mailbox/mailbox-service.js'
import {
  getAgentMaps,
  getAuthorName,
  buildChannelInputMetadata,
  buildMailboxPrompt,
  appendTeamRoster,
} from './validation.js'

export function registerMailboxHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.getMailbox', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return mailboxService.getMailboxSummary(agent.id)
  })

  h('agents.fetchMailbox', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return mailboxService.fetchMailbox(agent.id)
  })

  h('agents.ackMailbox', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const batchId = typeof params.batchId === 'string' ? params.batchId.trim() : ''
    if (!batchId) throw new Error('batchId required')
    const result = mailboxService.ackMailboxBatch(agent.id, batchId)
    if (!result.found) throw new Error('not_found')
    return { ok: true }
  })

  h('agents.getUnread', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return mailboxService.listLegacyUnreadChannels(agent.id)
  })

  h('agents.ack', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    const channelId = params.channelId as string
    const timestamp = params.timestamp as number
    if (!channelId || typeof timestamp !== 'number') throw new Error('channelId and numeric timestamp required')
    agentStore.setReadCursor(agent.id, channelId, timestamp)
    return { ok: true }
  })

  h('agents.respond', async (params) => {
    const agentId = params.id as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    if (!isAgentRunning(agentId)) throw new Error('Agent not running')

    if (params.mode === 'mailbox') {
      const lease = mailboxService.ensureMailboxLease(agentId)
      if (!lease) return { ok: true, response: '' }
      try {
        const response = await sendMessage(
          agentId,
          [{ authorName: 'System', content: buildMailboxPrompt(lease.messageCount) }],
          { source: 'mailbox', mailbox: { unreadCount: lease.messageCount, batchId: lease.batchId, expiresAt: lease.expiresAt } },
        )
        return { ok: true, response }
      } catch (err: any) {
        mailboxService.expireMailboxBatch(agentId, lease.batchId)
        throw err
      }
    }

    const unreadChannels = Array.isArray(params.channels) ? params.channels as mailboxService.MailboxChannelMessages[] : null
    if (!unreadChannels || unreadChannels.length === 0) return { ok: true, response: '' }

    const { allAgents, agentMap } = getAgentMaps()
    const allAgentIds = new Set(allAgents.map((a) => a.id))
    const relevantChannels = unreadChannels.filter((channel) => {
      const hasUserMessage = channel.messages.some((m) => !allAgentIds.has(m.authorId) && m.authorId !== 'system')
      const mentionsMe = channel.messages.some((m) => Array.isArray(m.mentionedAgentIds) && m.mentionedAgentIds.includes(agentId))
      return hasUserMessage || mentionsMe
    })

    if (relevantChannels.length === 0) {
      for (const channel of unreadChannels) {
        const lastMessage = channel.messages[channel.messages.length - 1]
        if (lastMessage) agentStore.setReadCursor(agentId, channel.channelId, lastMessage.timestamp)
      }
      return { ok: true, response: '[NO_RESPONSE]' }
    }

    const promptParts: string[] = ['You have new messages in your channels:\n']
    for (const channel of relevantChannels) {
      promptParts.push(`--- #${channel.channelName} ---`)
      for (const message of channel.messages) {
        promptParts.push(`${getAuthorName(agentMap, message.authorId)}: ${message.content}`)
      }
      promptParts.push('')
    }
    appendTeamRoster(promptParts, allAgents, agentId)
    promptParts.push('Read the messages above. If any are directed at you or relevant, respond using curl to send a message. If nothing requires your attention, reply with exactly: [NO_RESPONSE]')

    for (const channel of unreadChannels) {
      const lastMessage = channel.messages[channel.messages.length - 1]
      if (lastMessage) agentStore.setReadCursor(agentId, channel.channelId, lastMessage.timestamp)
    }

    const response = await sendMessage(
      agentId,
      [{ authorName: 'System', content: promptParts.join('\n') }],
      buildChannelInputMetadata(agentMap, relevantChannels),
    )
    return { ok: true, response }
  })
}
