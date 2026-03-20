import { SocketModeClient } from '@slack/socket-mode'
import { WebClient } from '@slack/web-api'
import * as slackSettingsStore from '../storage/slack-settings-store.js'
import * as agentStore from '../storage/agent-store.js'
import * as agentManager from '../agents/agent-manager.js'
import { markdownToBlocks } from './block-kit.js'

let socketClient: SocketModeClient | null = null
let webClient: WebClient | null = null
let botUserId: string | null = null

// Cache Slack user display names to avoid repeated API calls
const slackUserNameCache = new Map<string, string>()

export function isSlackConnected(): boolean {
  return webClient !== null
}

export function getSlackWebClient(): WebClient | null {
  return webClient
}

export async function startSlackConnection(): Promise<void> {
  console.log('[slack] startSlackConnection called')
  const botToken = slackSettingsStore.getSlackBotToken()
  if (!botToken) {
    console.log('[slack] No bot token found, skipping')
    return
  }
  console.log('[slack] Bot token found, connecting...')

  // Don't double-connect
  if (socketClient || webClient) {
    await stopSlackConnection()
  }

  webClient = new WebClient(botToken)

  // Resolve bot user ID for filtering out own messages
  try {
    const authResult = await webClient.auth.test()
    botUserId = authResult.user_id as string || null
    console.log(`Slack bot authenticated as user ${botUserId}`)
  } catch (err) {
    console.error('Slack auth.test failed:', err)
  }

  // Socket Mode (inbound) only works with an app-level token
  const appToken = slackSettingsStore.getSlackAppToken()
  if (!appToken) {
    console.log('[slack] No app token — outbound only (no Socket Mode)')
    return
  }
  console.log('[slack] App token found, starting Socket Mode...')

  socketClient = new SocketModeClient({ appToken })

  socketClient.on('message', async ({ event, ack }) => {
    try {
      await ack()
    } catch (e) {
      console.error('Slack ack failed:', e)
    }
    if (!event) return
    // Skip bot's own messages and bot_message subtypes
    if (event.bot_id || event.subtype === 'bot_message') return
    if (botUserId && event.user === botUserId) return

    console.log(`[slack] message in ${event.channel} from ${event.user}: ${(event.text || '').slice(0, 80)}`)
    handleInboundMessage(event.channel, event.user, event.text || '', event.ts)
  })

  socketClient.on('app_mention', async ({ event, ack }) => {
    try {
      await ack()
    } catch (e) {
      console.error('Slack ack failed:', e)
    }
    if (!event) return
    if (botUserId && event.user === botUserId) return

    console.log(`[slack] app_mention in ${event.channel} from ${event.user}: ${(event.text || '').slice(0, 80)}`)
    handleInboundMessage(event.channel, event.user, event.text || '', event.ts)
  })

  socketClient.on('slack_event', ({ type }) => {
    console.log(`[slack] event: ${type}`)
  })

  try {
    await socketClient.start()
    console.log('Slack Socket Mode connected')
  } catch (err) {
    console.error('Failed to start Slack Socket Mode:', err)
    socketClient = null
    webClient = null
  }
}

export async function stopSlackConnection(): Promise<void> {
  if (socketClient) {
    try {
      await socketClient.disconnect()
    } catch { /* ignore */ }
    socketClient = null
  }
  webClient = null
  botUserId = null
  slackUserNameCache.clear()
  console.log('Slack Socket Mode disconnected')
}

// ── Inbound: Slack → Agent ─────────────────────────────────────────────

async function handleInboundMessage(slackChannelId: string, slackUserId: string, text: string, threadTs: string): Promise<void> {
  if (!text.trim()) return

  // Look up which agent is synced to this Slack channel
  const agent = agentStore.getAgentBySlackChannel(slackChannelId)
  if (!agent) {
    console.log(`[slack] No agent synced to channel ${slackChannelId}, ignoring`)
    return
  }

  // Check if agent is running
  if (!agentManager.isAgentRunning(agent.id)) {
    await postEphemeral(slackChannelId, slackUserId, `Agent *${agent.name}* is not running. Start it in Dune first.`)
    return
  }

  // Resolve Slack user display name
  const authorName = await resolveSlackUserName(slackUserId)

  try {
    const response = await agentManager.sendMessage(
      agent.id,
      [{ authorName, content: text }],
      { source: 'slack' as any },
    )
    await postAgentReplyToSlack(response, slackChannelId, threadTs)
  } catch (err) {
    console.error(`[slack] Failed to process message for agent ${agent.name}:`, err)
    await postEphemeral(slackChannelId, slackUserId, `Failed to get a response from *${agent.name}*.`)
  }
}

async function resolveSlackUserName(slackUserId: string): Promise<string> {
  const cached = slackUserNameCache.get(slackUserId)
  if (cached) return cached

  if (!webClient) return slackUserId

  try {
    const result = await webClient.users.info({ user: slackUserId })
    const name = result.user?.real_name || result.user?.name || slackUserId
    slackUserNameCache.set(slackUserId, name)
    return name
  } catch {
    return slackUserId
  }
}

// ── Outbound: Agent → Slack ────────────────────────────────────────────

async function postAgentReplyToSlack(text: string, channelId: string, threadTs: string): Promise<void> {
  if (!webClient || !text.trim()) return

  const blocks = markdownToBlocks(text)

  try {
    await webClient.chat.postMessage({
      channel: channelId,
      blocks,
      text, // fallback for notifications
      thread_ts: threadTs,
    })
  } catch (err) {
    console.error('[slack] Failed to post agent reply:', err)
  }
}

async function postEphemeral(channelId: string, userId: string, text: string): Promise<void> {
  if (!webClient) return
  try {
    await webClient.chat.postEphemeral({ channel: channelId, user: userId, text })
  } catch (err) {
    console.error('[slack] Failed to post ephemeral:', err)
  }
}

// ── Sync / Unsync ──────────────────────────────────────────────────────

export async function syncAgentToSlack(agentId: string): Promise<{ slackChannelId: string; slackChannelName: string }> {
  if (!webClient) throw new Error('Slack is not connected')

  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')
  if (agent.slackChannelId) throw new Error('Agent is already synced to Slack')

  // Sanitize channel name: lowercase, hyphens, no special chars, max 80 chars
  const channelName = `dune-${agent.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 74)}`

  let slackChannelId: string
  let finalName: string

  try {
    const result = await webClient.conversations.create({ name: channelName })
    slackChannelId = result.channel?.id as string
    finalName = result.channel?.name as string || channelName
  } catch (err: any) {
    // If name is taken, try with a suffix
    if (err?.data?.error === 'name_taken') {
      const suffix = `-${Date.now().toString(36).slice(-4)}`
      const retryName = channelName.slice(0, 80 - suffix.length) + suffix
      const result = await webClient.conversations.create({ name: retryName })
      slackChannelId = result.channel?.id as string
      finalName = result.channel?.name as string || retryName
    } else {
      throw err
    }
  }

  // Set channel topic
  try {
    const topic = agent.personality.slice(0, 250)
    await webClient.conversations.setTopic({ channel: slackChannelId, topic })
  } catch {
    // Non-critical
  }

  // Save the mapping
  agentStore.updateAgent(agentId, { slackChannelId })

  return { slackChannelId, slackChannelName: finalName }
}

export async function unsyncAgentFromSlack(agentId: string): Promise<void> {
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
