import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import * as slackSettingsStore from '../../storage/slack-settings-store.js'
import * as slackConnection from '../../slack/slack-connection.js'

export function registerSlackHandlers(h: (method: string, fn: Handler) => void): void {
  h('slack.getSettings', async () => {
    return slackSettingsStore.getSlackSettingsSummary()
  })

  h('slack.updateSettings', async (params) => {
    const data: { botToken?: string; appToken?: string } = {}
    if (typeof params.botToken === 'string') data.botToken = params.botToken
    if (typeof params.appToken === 'string') data.appToken = params.appToken
    if (Object.keys(data).length > 0) {
      slackSettingsStore.updateSlackCredentials(data)
      await slackConnection.startSlackConnection()
    }
    return slackSettingsStore.getSlackSettingsSummary()
  })

  h('slack.disconnect', async () => {
    await slackConnection.stopSlackConnection()
    slackSettingsStore.clearSlackInstallation()
    return { ok: true }
  })

  h('slack.syncAgent', async (params) => {
    const agentId = params.agentId as string
    if (!agentId) throw new Error('agentId required')
    return slackConnection.syncAgentToSlack(agentId)
  })

  h('slack.unsyncAgent', async (params) => {
    const agentId = params.agentId as string
    if (!agentId) throw new Error('agentId required')
    await slackConnection.unsyncAgentFromSlack(agentId)
    return { ok: true }
  })

  h('slack.syncAllAgents', async () => {
    return slackConnection.syncAllAgentsToSlack()
  })

  h('slack.syncAllChannels', async () => {
    return slackConnection.syncAllChannelsToSlack()
  })

  h('slack.syncChannel', async (params) => {
    const channelId = params.channelId as string
    if (!channelId) throw new Error('channelId required')
    return slackConnection.syncChannelToSlack(channelId)
  })

  h('slack.unsyncChannel', async (params) => {
    const channelId = params.channelId as string
    if (!channelId) throw new Error('channelId required')
    await slackConnection.unsyncChannelFromSlack(channelId)
    return { ok: true }
  })

  h('slack.listChannelLinks', async () => {
    return slackConnection.listChannelSlackLinks()
  })

  h('slack.sendMessage', async (params) => {
    const agentId = params.agentId as string
    if (!agentId) throw new Error('agentId required')
    const text = params.text as string
    if (!text) throw new Error('text required')
    const channelId = (params.channelId as string) || agentStore.getAgent(agentId)?.slackChannelId
    if (!channelId) throw new Error('No Slack channel: agent is not synced and no channelId provided')
    return slackConnection.sendMessageToSlack(text, channelId)
  })

  h('slack.sendImage', async (params) => {
    const agentId = params.agentId as string
    if (!agentId) throw new Error('agentId required')
    const imageUrl = params.imageUrl as string
    if (!imageUrl) throw new Error('imageUrl required')
    const alt = (params.alt as string) || 'image'
    const channelId = (params.channelId as string) || agentStore.getAgent(agentId)?.slackChannelId
    if (!channelId) throw new Error('No Slack channel: agent is not synced and no channelId provided')
    await slackConnection.sendImageToSlack(imageUrl, alt, channelId)
    return { ok: true }
  })
}
