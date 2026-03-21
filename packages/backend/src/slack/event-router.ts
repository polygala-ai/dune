import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as slackSettingsStore from '../storage/slack-settings-store.js'
import * as agentStore from '../storage/agent-store.js'
import * as channelStore from '../storage/channel-store.js'
import * as messageStore from '../storage/message-store.js'
import * as agentManager from '../agents/agent-manager.js'
import { markdownToBlocks, extractImageUrls } from './block-kit.js'
import { sendToChannel as broadcastToChannel } from '../gateway/broadcast.js'
import { config } from '../config.js'
import {
  getWebClient,
  resolveSlackUserName,
  setAgentSlackThread,
  deleteAgentSlackThread,
} from './connection.js'
import { handleTextApproval } from './approval-notify.js'

const MEDIA_DIR = join(config.dataRoot, 'media')

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

// ── Inbound: Slack -> Agent ─────────────────────────────────────────────

export async function handleInboundMessage(slackChannelId: string, slackUserId: string, text: string, threadTs: string, files: any[]): Promise<void> {
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

  // Find agent's subscribed Dune channels for syncing the conversation
  const subscribedChannelIds = channelStore.getAgentSubscriptions(agent.id)

  // Sync the human's message to subscribed Dune channels
  for (const duneChannelId of subscribedChannelIds) {
    const channelContent = `**${authorName}** (via Slack): ${fullText}`
    const msg = messageStore.createMessage(duneChannelId, 'user', channelContent)
    broadcastToChannel(duneChannelId, { type: 'message:new', payload: msg })
  }

  // Track Slack thread context so host operator approvals route to this channel
  setAgentSlackThread(agent.id, { channelId: slackChannelId, threadTs })
  try {
    const slackContent = `[via Slack #dune-agent-${agent.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}] ${fullText}`
    const response = await agentManager.sendMessage(
      agent.id,
      [{ authorName, content: slackContent }],
      { source: 'slack' },
    )
    await postAgentReplyToSlack(response, slackChannelId, threadTs)

    // Sync the agent's response to subscribed Dune channels
    if (response.trim()) {
      for (const duneChannelId of subscribedChannelIds) {
        const agentMsg = messageStore.createMessage(duneChannelId, agent.id, response)
        broadcastToChannel(duneChannelId, { type: 'message:new', payload: agentMsg })
      }
    }
  } catch (err) {
    console.error(`[slack] Failed to process message for agent ${agent.name}:`, err)
    await postEphemeral(slackChannelId, slackUserId, `Failed to get a response from *${agent.name}*.`)
  } finally {
    deleteAgentSlackThread(agent.id)
  }
}

// ── Outbound: Agent -> Slack ────────────────────────────────────────────

async function postAgentReplyToSlack(text: string, channelId: string, threadTs?: string): Promise<void> {
  const webClient = getWebClient()
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
  const webClient = getWebClient()
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
  const webClient = getWebClient()
  if (!webClient) return
  try {
    await webClient.chat.postEphemeral({ channel: channelId, user: userId, text })
  } catch (err) {
    console.error('[slack] Failed to post ephemeral:', err)
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

// ── Direct Send (agent-initiated) ─────────────────────────────────────

/** Send a text message to a Slack channel (public API for RPC). */
export async function sendMessageToSlack(
  text: string,
  channelId: string,
): Promise<{ ok: boolean; ts: string }> {
  const webClient = getWebClient()
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
  const webClient = getWebClient()
  if (!webClient) throw new Error('Slack is not connected')

  if (!imageUrl.startsWith('/media/')) {
    throw new Error(`Only local /media/ URLs are supported, got: ${imageUrl}`)
  }

  const filename = basename(imageUrl)
  const filePath = join(MEDIA_DIR, filename)
  const fileData = readFileSync(filePath)
  await webClient.filesUploadV2({
    channel_id: channelId,
    file: fileData,
    filename,
    title: alt,
  })
}
