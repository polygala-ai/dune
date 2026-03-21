import * as agentStore from '../storage/agent-store.js'
import { getWebClient } from './connection.js'
import { createSlackChannel, sanitizeSlackName } from './channel-sync.js'

export async function syncAgentToSlack(agentId: string): Promise<{ slackChannelId: string; slackChannelName: string }> {
  const webClient = getWebClient()
  if (!webClient) throw new Error('Slack is not connected')

  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')
  if (agent.slackChannelId) throw new Error('Agent is already synced to Slack')

  const channelName = sanitizeSlackName('dune-agent-', agent.name, 68)
  const result = await createSlackChannel(channelName)

  // Set channel topic
  try {
    const topic = agent.personality.slice(0, 250)
    await webClient.conversations.setTopic({ channel: result.id, topic })
  } catch {
    // Non-critical
  }

  // Save the mapping
  agentStore.updateAgent(agentId, { slackChannelId: result.id })

  return { slackChannelId: result.id, slackChannelName: result.name }
}

export async function unsyncAgentFromSlack(agentId: string): Promise<void> {
  const webClient = getWebClient()
  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')
  if (!agent.slackChannelId) return

  // Archive the Slack channel
  if (webClient) {
    try {
      await webClient.conversations.archive({ channel: agent.slackChannelId })
    } catch {
      // Channel may already be archived or deleted
    }
  }

  agentStore.updateAgent(agentId, { slackChannelId: null })
}

export async function syncAllAgentsToSlack(): Promise<{ synced: number; errors: string[] }> {
  const webClient = getWebClient()
  if (!webClient) throw new Error('Slack is not connected')

  const agents = agentStore.listAgents()
  const unsynced = agents.filter(a => !a.slackChannelId)
  let synced = 0
  const errors: string[] = []

  for (const agent of unsynced) {
    try {
      await syncAgentToSlack(agent.id)
      synced++
    } catch (err: any) {
      errors.push(`${agent.name}: ${err.message ?? 'unknown error'}`)
    }
  }

  return { synced, errors }
}
