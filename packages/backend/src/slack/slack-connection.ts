import { SocketModeClient } from '@slack/socket-mode'
import { WebClient } from '@slack/web-api'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as slackSettingsStore from '../storage/slack-settings-store.js'
import * as agentStore from '../storage/agent-store.js'
import * as channelStore from '../storage/channel-store.js'
import * as agentManager from '../agents/agent-manager.js'
import { markdownToBlocks, extractImageUrls } from './block-kit.js'
import { config } from '../config.js'
import type { HostOperatorRequest } from '@dune/shared'
import { getDb } from '../storage/database.js'
import { newId } from '../utils/ids.js'

let socketClient: SocketModeClient | null = null
let webClient: WebClient | null = null
let botUserId: string | null = null

// Cache Slack user display names to avoid repeated API calls
const slackUserNameCache = new Map<string, string>()

// Track posted approval messages: requestId → array of posted messages (may be in multiple channels)
const approvalMessages = new Map<string, Array<{ ts: string; channelId: string }>>()

// Track the active Slack thread per agent (set during sendMessage, cleared after)
const agentSlackThread = new Map<string, { channelId: string; threadTs: string }>()

export function isAgentTurnFromSlack(agentId: string): boolean {
  return agentSlackThread.has(agentId)
}

export function getAgentSlackThread(agentId: string): { channelId: string; threadTs: string } | null {
  return agentSlackThread.get(agentId) ?? null
}

const MEDIA_DIR = join(config.dataRoot, 'media')

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

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

// ── Inbound: Slack → Agent ─────────────────────────────────────────────

async function handleInboundMessage(slackChannelId: string, slackUserId: string, text: string, threadTs: string, files: any[]): Promise<void> {
  // Check if this is a text-based approval in the approval channel
  const approvalChannelId = slackSettingsStore.getApprovalChannelId()
  if (approvalChannelId && slackChannelId === approvalChannelId) {
    const handled = await handleTextApproval(slackUserId, text.trim())
    if (handled) return
  }

  // Download any image attachments from Slack and append as markdown
  const imageMarkdown = await downloadSlackImages(files)
  const fullText = imageMarkdown ? `${text}\n${imageMarkdown}` : text

  if (!fullText.trim()) return

  // Look up which agent is synced to this Slack channel
  const agent = agentStore.getAgentBySlackChannel(slackChannelId)
  if (!agent) {
    console.log(`[slack] No agent synced to channel ${slackChannelId}, ignoring`)
    return
  }

  // Auto-start agent if not running
  if (!agentManager.isAgentRunning(agent.id)) {
    try {
      console.log(`[slack] Auto-starting agent ${agent.name} for inbound Slack message`)
      await agentManager.startAgent(agent.id)
    } catch (err) {
      console.error(`[slack] Failed to auto-start agent ${agent.name}:`, err)
      await postEphemeral(slackChannelId, slackUserId, `Failed to start agent *${agent.name}*. Check Dune for details.`)
      return
    }
  }

  // Resolve Slack user display name
  const authorName = await resolveSlackUserName(slackUserId)

  // Track Slack thread context so host operator approvals route to this channel
  agentSlackThread.set(agent.id, { channelId: slackChannelId, threadTs })
  try {
    const slackContent = `[via Slack #dune-agent-${agent.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}] ${fullText}`
    const response = await agentManager.sendMessage(
      agent.id,
      [{ authorName, content: slackContent }],
      { source: 'slack' },
    )
    await postAgentReplyToSlack(response, slackChannelId, threadTs)
  } catch (err) {
    console.error(`[slack] Failed to process message for agent ${agent.name}:`, err)
    await postEphemeral(slackChannelId, slackUserId, `Failed to get a response from *${agent.name}*.`)
  } finally {
    agentSlackThread.delete(agent.id)
  }
}

/** Download image files from Slack and save to media directory, returning markdown references. */
async function downloadSlackImages(files: any[]): Promise<string> {
  if (!files || files.length === 0) return ''
  const botToken = slackSettingsStore.getSlackBotToken()
  if (!botToken) return ''

  const parts: string[] = []
  for (const file of files) {
    if (!file.mimetype?.startsWith('image/')) continue
    const downloadUrl = file.url_private_download || file.url_private
    if (!downloadUrl) continue

    try {
      const resp = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${botToken}` },
      })
      if (!resp.ok) {
        console.error(`[slack] Failed to download file ${file.name}: ${resp.status}`)
        continue
      }

      const ext = MIME_TO_EXT[file.mimetype] || '.png'
      const filename = `${randomUUID()}${ext}`
      mkdirSync(MEDIA_DIR, { recursive: true })
      const buffer = Buffer.from(await resp.arrayBuffer())
      writeFileSync(join(MEDIA_DIR, filename), buffer)

      parts.push(`![${file.name || 'image'}](/media/${filename})`)
    } catch (err) {
      console.error(`[slack] Failed to download Slack file ${file.name}:`, err)
    }
  }
  return parts.join('\n')
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

async function postAgentReplyToSlack(text: string, channelId: string, threadTs?: string): Promise<void> {
  if (!webClient || !text.trim()) return

  // Extract images from markdown — upload them to Slack separately
  const { textWithoutImages, images } = extractImageUrls(text)

  // Send text portion
  if (textWithoutImages.trim()) {
    const blocks = markdownToBlocks(textWithoutImages)
    try {
      await webClient.chat.postMessage({
        channel: channelId,
        blocks,
        text: textWithoutImages, // fallback for notifications
        ...(threadTs ? { thread_ts: threadTs } : {}),
      })
    } catch (err: any) {
      if (threadTs && err?.data?.error === 'cannot_reply_to_message') {
        console.log('[slack] Threading not supported for this message, posting as top-level')
        await postAgentReplyToSlack(text, channelId)
        return
      }
      console.error('[slack] Failed to post agent reply:', err)
    }
  }

  // Upload local images to Slack
  for (const img of images) {
    try {
      await uploadImageToSlack(img.url, img.alt, channelId, threadTs)
    } catch (err) {
      console.error(`[slack] Failed to upload image to Slack:`, err)
    }
  }
}

/** Upload a local image file to Slack. */
async function uploadImageToSlack(imageUrl: string, alt: string, channelId: string, threadTs?: string): Promise<void> {
  if (!webClient) return

  // Only handle local media URLs
  if (!imageUrl.startsWith('/media/')) {
    // For external URLs, they'll be auto-unfurled by Slack in the text
    return
  }

  const filename = basename(imageUrl)
  const filePath = join(MEDIA_DIR, filename)

  try {
    const fileData = readFileSync(filePath)
    await webClient.filesUploadV2({
      channel_id: channelId,
      file: fileData,
      filename,
      title: alt,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    })
  } catch (err) {
    console.error(`[slack] Failed to upload file ${filename} to Slack:`, err)
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

// ── Host Operator Approval via Slack ──────────────────────────────────

// Lazy import to avoid circular dependency
let _hostOperatorService: typeof import('../host-operator/host-operator-service.js') | null = null
async function getHostOperatorService() {
  if (!_hostOperatorService) {
    _hostOperatorService = await import('../host-operator/host-operator-service.js')
  }
  return _hostOperatorService
}

export async function postApprovalRequest(request: HostOperatorRequest): Promise<void> {
  if (!webClient) return

  const approvalChannelId = slackSettingsStore.getApprovalChannelId()
  const agent = agentStore.getAgent(request.agentId)
  const agentName = agent?.name ?? request.agentId
  const threadCtx = getAgentSlackThread(request.agentId)
  const agentChannelId = threadCtx?.channelId ?? agent?.slackChannelId ?? null

  // Nothing to post to
  if (!approvalChannelId && !agentChannelId) return

  const target = request.target
  const targetLine = target?.appName
    ? `${target.appName}${target.bundleId ? ` (${target.bundleId})` : ''}`
    : target?.path ?? 'N/A'

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:bell: *Host Operator Approval Request*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
        { type: 'mrkdwn', text: `*Action:*\n${request.kind}${request.input.kind === 'act' ? ` → ${(request.input as any).action}` : ''}` },
        { type: 'mrkdwn', text: `*Target:*\n${targetLine}` },
        { type: 'mrkdwn', text: `*Request ID:*\n\`${request.requestId.slice(0, 8)}\`` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:*\n${request.summary}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve' },
          style: 'primary',
          action_id: 'host_op_approve',
          value: request.requestId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject' },
          style: 'danger',
          action_id: 'host_op_reject',
          value: request.requestId,
        },
      ],
    },
  ]

  const fallbackText = `Approval needed: ${agentName} wants to ${request.kind} — ${request.summary}`
  const entries: Array<{ ts: string; channelId: string }> = []

  // Post to the agent's own Slack channel (threaded if context available)
  if (agentChannelId) {
    try {
      const result = await webClient.chat.postMessage({
        channel: agentChannelId,
        blocks,
        text: fallbackText,
        ...(threadCtx?.threadTs ? { thread_ts: threadCtx.threadTs } : {}),
      })
      if (result.ts) entries.push({ ts: result.ts, channelId: agentChannelId })
    } catch (err) {
      console.error('[slack] Failed to post approval in agent channel:', err)
    }
  }

  // Also post to the dedicated approval channel (monitoring/audit) if different
  if (approvalChannelId && approvalChannelId !== agentChannelId) {
    try {
      const result = await webClient.chat.postMessage({
        channel: approvalChannelId,
        blocks,
        text: fallbackText,
      })
      if (result.ts) entries.push({ ts: result.ts, channelId: approvalChannelId })
    } catch (err) {
      console.error('[slack] Failed to post approval request:', err)
    }
  }

  if (entries.length > 0) {
    approvalMessages.set(request.requestId, entries)
  }
}

export async function updateApprovalMessage(request: HostOperatorRequest): Promise<void> {
  if (!webClient) return
  const messages = approvalMessages.get(request.requestId)
  if (!messages || messages.length === 0) return

  const emoji = request.decision === 'approve' ? ':white_check_mark:' : ':x:'
  const label = request.decision === 'approve' ? 'Approved' : 'Rejected'
  const approver = request.approverId ?? 'unknown'

  const agent = agentStore.getAgent(request.agentId)
  const agentName = agent?.name ?? request.agentId
  const target = request.target
  const targetLine = target?.appName
    ? `${target.appName}${target.bundleId ? ` (${target.bundleId})` : ''}`
    : target?.path ?? 'N/A'

  const decidedAt = request.decidedAt ? new Date(request.decidedAt).toLocaleString() : 'N/A'

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${label} by ${approver}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
        { type: 'mrkdwn', text: `*Action:*\n${request.kind}` },
        { type: 'mrkdwn', text: `*Target:*\n${targetLine}` },
        { type: 'mrkdwn', text: `*Decided:*\n${decidedAt}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:*\n${request.summary}`,
      },
    },
  ]

  const fallbackText = `${label} by ${approver}: ${request.summary}`
  for (const msg of messages) {
    try {
      await webClient.chat.update({
        channel: msg.channelId,
        ts: msg.ts,
        blocks,
        text: fallbackText,
      })
    } catch (err) {
      console.error('[slack] Failed to update approval message:', err)
    }
  }
  approvalMessages.delete(request.requestId)
}

async function handleInteractiveAction(body: any): Promise<void> {
  const action = body.actions[0]
  if (action.action_id !== 'host_op_approve' && action.action_id !== 'host_op_reject') return

  const requestId = action.value as string
  const decision = action.action_id === 'host_op_approve' ? 'approve' : 'reject' as const
  const slackUserId = body.user?.id as string

  const approverName = await resolveSlackUserName(slackUserId)
  console.log(`[slack] ${approverName} clicked ${decision} for request ${requestId}`)

  try {
    const hostOperatorService = await getHostOperatorService()
    const decided = await hostOperatorService.decideHostOperatorRequest({
      requestId,
      decision,
      approverId: approverName,
      agentLookup: (agentId) => agentStore.getAgent(agentId),
    })
    if (!decided) {
      console.error(`[slack] Request ${requestId} not found or already decided`)
    }
  } catch (err: any) {
    console.error(`[slack] Failed to decide request ${requestId}:`, err)
    // Post ephemeral error to the user who clicked
    if (body.channel?.id && slackUserId) {
      await postEphemeral(body.channel.id, slackUserId, `Failed to ${decision} request: ${err.message ?? 'unknown error'}`)
    }
  }
}

async function handleTextApproval(slackUserId: string, text: string): Promise<boolean> {
  const normalized = text.toLowerCase().trim()
  let decision: 'approve' | 'reject' | null = null

  if (/^approve\b/i.test(normalized)) decision = 'approve'
  else if (/^reject\b/i.test(normalized)) decision = 'reject'
  if (!decision) return false

  // Extract optional requestId from text (e.g. "approve abc123")
  const parts = text.trim().split(/\s+/)
  let requestId: string | null = parts.length > 1 ? parts[1] : null

  const hostOperatorService = await getHostOperatorService()

  // If no requestId specified, use the most recent pending request
  if (!requestId) {
    const pending = hostOperatorService.listPendingHostOperatorRequests(1)
    if (pending.length === 0) {
      const approvalChannelId = slackSettingsStore.getApprovalChannelId()
      if (approvalChannelId) {
        await postEphemeral(approvalChannelId, slackUserId, 'No pending approval requests.')
      }
      return true
    }
    requestId = pending[0].requestId
  }

  const approverName = await resolveSlackUserName(slackUserId)
  console.log(`[slack] ${approverName} text-${decision}d request ${requestId}`)

  try {
    const decided = await hostOperatorService.decideHostOperatorRequest({
      requestId,
      decision,
      approverId: approverName,
      agentLookup: (agentId) => agentStore.getAgent(agentId),
    })
    if (!decided) {
      const approvalChannelId = slackSettingsStore.getApprovalChannelId()
      if (approvalChannelId) {
        await postEphemeral(approvalChannelId, slackUserId, `Request \`${requestId}\` not found or already decided.`)
      }
    }
  } catch (err: any) {
    const approvalChannelId = slackSettingsStore.getApprovalChannelId()
    if (approvalChannelId) {
      await postEphemeral(approvalChannelId, slackUserId, `Failed to ${decision}: ${err.message ?? 'unknown error'}`)
    }
  }
  return true
}

// ── Direct Send (agent-initiated) ─────────────────────────────────────

/** Send a text message to a Slack channel (public API for RPC). */
export async function sendMessageToSlack(
  text: string,
  channelId: string,
): Promise<{ ok: boolean; ts: string }> {
  if (!webClient) throw new Error('Slack is not connected')

  const { textWithoutImages, images } = extractImageUrls(text)

  let ts = ''
  if (textWithoutImages.trim()) {
    const blocks = markdownToBlocks(textWithoutImages)
    const result = await webClient.chat.postMessage({
      channel: channelId,
      blocks,
      text: textWithoutImages,
    })
    ts = (result.ts as string) || ''
  }

  for (const img of images) {
    try {
      await uploadImageToSlack(img.url, img.alt, channelId)
    } catch (err) {
      console.error('[slack] Failed to upload embedded image:', err)
    }
  }

  return { ok: true, ts }
}

/** Upload a local /media/ image to a Slack channel (public API for RPC). */
export async function sendImageToSlack(
  imageUrl: string,
  alt: string,
  channelId: string,
): Promise<void> {
  if (!webClient) throw new Error('Slack is not connected')
  await uploadImageToSlack(imageUrl, alt, channelId)
}

// ── Sync / Unsync ──────────────────────────────────────────────────────

export async function syncAgentToSlack(agentId: string): Promise<{ slackChannelId: string; slackChannelName: string }> {
  if (!webClient) throw new Error('Slack is not connected')

  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')
  if (agent.slackChannelId) throw new Error('Agent is already synced to Slack')

  // Sanitize channel name: lowercase, hyphens, no special chars, max 80 chars
  const channelName = `dune-agent-${agent.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 68)}`

  let slackChannelId: string
  let finalName: string

  try {
    const result = await webClient.conversations.create({ name: channelName })
    slackChannelId = result.channel?.id as string
    finalName = result.channel?.name as string || channelName
  } catch (err: any) {
    if (err?.data?.error === 'missing_scope') {
      throw new Error('Slack app is missing the "channels:manage" scope. Re-install the app with the updated manifest from Settings → Integrations.')
    }
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

// ── Channel Sync ─────────────────────────────────────────────────────

function sanitizeSlackName(prefix: string, name: string, maxLen: number): string {
  return `${prefix}${name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, maxLen)}`
}

async function createSlackChannel(channelName: string): Promise<{ id: string; name: string }> {
  if (!webClient) throw new Error('Slack is not connected')
  try {
    const result = await webClient.conversations.create({ name: channelName })
    return { id: result.channel?.id as string, name: result.channel?.name as string || channelName }
  } catch (err: any) {
    if (err?.data?.error === 'missing_scope') {
      throw new Error('Slack app is missing the "channels:manage" scope.')
    }
    if (err?.data?.error === 'name_taken') {
      const suffix = `-${Date.now().toString(36).slice(-4)}`
      const retryName = channelName.slice(0, 80 - suffix.length) + suffix
      const result = await webClient.conversations.create({ name: retryName })
      return { id: result.channel?.id as string, name: result.channel?.name as string || retryName }
    }
    throw err
  }
}

export function getChannelSlackLink(duneChannelId: string): { slackChannelId: string; slackChannelName: string } | null {
  const row = getDb().prepare(
    'SELECT slack_channel_id AS slackChannelId, slack_channel_name AS slackChannelName FROM slack_channel_links WHERE dune_channel_id = ?'
  ).get(duneChannelId) as { slackChannelId: string; slackChannelName: string } | undefined
  return row ?? null
}

export function listChannelSlackLinks(): Array<{ id: string; duneChannelId: string; slackChannelId: string; slackChannelName: string }> {
  return getDb().prepare(
    'SELECT id, dune_channel_id AS duneChannelId, slack_channel_id AS slackChannelId, slack_channel_name AS slackChannelName FROM slack_channel_links'
  ).all() as any[]
}

export async function syncChannelToSlack(duneChannelId: string): Promise<{ slackChannelId: string; slackChannelName: string }> {
  if (!webClient) throw new Error('Slack is not connected')

  const channel = channelStore.getChannel(duneChannelId)
  if (!channel) throw new Error('Channel not found')

  const existing = getChannelSlackLink(duneChannelId)
  if (existing) throw new Error('Channel is already synced to Slack')

  const channelName = sanitizeSlackName('dune-channel-', channel.name, 67)
  const result = await createSlackChannel(channelName)

  // Set channel topic
  try {
    const topic = channel.description?.slice(0, 250) || `Dune channel: ${channel.name}`
    await webClient.conversations.setTopic({ channel: result.id, topic })
  } catch { /* Non-critical */ }

  // Save the link
  getDb().prepare(
    'INSERT INTO slack_channel_links (id, dune_channel_id, slack_channel_id, slack_channel_name, direction, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(newId(), duneChannelId, result.id, result.name, 'bidirectional', Date.now())

  return { slackChannelId: result.id, slackChannelName: result.name }
}

export async function unsyncChannelFromSlack(duneChannelId: string): Promise<void> {
  const link = getChannelSlackLink(duneChannelId)
  if (!link) return

  if (webClient) {
    try {
      await webClient.conversations.archive({ channel: link.slackChannelId })
    } catch { /* Channel may already be archived */ }
  }

  getDb().prepare('DELETE FROM slack_channel_links WHERE dune_channel_id = ?').run(duneChannelId)
}

// ── Bulk Sync ────────────────────────────────────────────────────────

export async function syncAllAgentsToSlack(): Promise<{ synced: number; errors: string[] }> {
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

export async function syncAllChannelsToSlack(): Promise<{ synced: number; errors: string[] }> {
  if (!webClient) throw new Error('Slack is not connected')

  const channels = channelStore.listChannels()
  const linkedIds = new Set(listChannelSlackLinks().map(l => l.duneChannelId))
  const unsynced = channels.filter(c => !linkedIds.has(c.id))
  let synced = 0
  const errors: string[] = []

  for (const channel of unsynced) {
    try {
      await syncChannelToSlack(channel.id)
      synced++
    } catch (err: any) {
      errors.push(`${channel.name}: ${err.message ?? 'unknown error'}`)
    }
  }

  return { synced, errors }
}
