import { SocketModeClient } from '@slack/socket-mode'
import { WebClient } from '@slack/web-api'
import * as slackSettingsStore from '../storage/slack-settings-store.js'
import { handleInboundMessage } from './event-router.js'
import { handleInteractiveAction } from './approval-notify.js'

let socketClient: SocketModeClient | null = null
let webClient: WebClient | null = null
let botUserId: string | null = null

// Cache Slack user display names to avoid repeated API calls
const slackUserNameCache = new Map<string, string>()

// Track the active Slack thread per agent (set during sendMessage, cleared after)
const agentSlackThread = new Map<string, { channelId: string; threadTs: string }>()

// ── Shared accessors ────────────────────────────────────────────────

export function getWebClient(): WebClient | null {
  return webClient
}

export function getBotUserId(): string | null {
  return botUserId
}

export function isSlackConnected(): boolean {
  return webClient !== null
}

export function getSlackWebClient(): WebClient | null {
  return webClient
}

export function isAgentTurnFromSlack(agentId: string): boolean {
  return agentSlackThread.has(agentId)
}

export function getAgentSlackThread(agentId: string): { channelId: string; threadTs: string } | null {
  return agentSlackThread.get(agentId) ?? null
}

export function setAgentSlackThread(agentId: string, ctx: { channelId: string; threadTs: string }): void {
  agentSlackThread.set(agentId, ctx)
}

export function deleteAgentSlackThread(agentId: string): void {
  agentSlackThread.delete(agentId)
}

export async function resolveSlackUserName(slackUserId: string): Promise<string> {
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

// ── Lifecycle ───────────────────────────────────────────────────────

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
    handleInboundMessage(event.channel, event.user, event.text || '', event.ts, event.files || [])
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
    handleInboundMessage(event.channel, event.user, event.text || '', event.ts, event.files || [])
  })

  socketClient.on('slack_event', ({ type }) => {
    console.log(`[slack] event: ${type}`)
  })

  socketClient.on('interactive', async ({ body, ack }: any) => {
    try {
      await ack()
    } catch (e) {
      console.error('Slack interactive ack failed:', e)
    }
    if (body?.type !== 'block_actions' || !body.actions?.length) return
    handleInteractiveAction(body)
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
