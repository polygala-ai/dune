import * as channelStore from '../storage/channel-store.js'
import { getDb } from '../storage/database.js'
import { newId } from '../utils/ids.js'
import { getWebClient } from './connection.js'

// ── Helpers ─────────────────────────────────────────────────────────

export function sanitizeSlackName(prefix: string, name: string, maxLen: number): string {
  return `${prefix}${name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, maxLen)}`
}

export async function createSlackChannel(channelName: string): Promise<{ id: string; name: string }> {
  const webClient = getWebClient()
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

// ── Channel Link CRUD ───────────────────────────────────────────────

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
  const webClient = getWebClient()
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
  const webClient = getWebClient()
  const link = getChannelSlackLink(duneChannelId)
  if (!link) return

  if (webClient) {
    try {
      await webClient.conversations.archive({ channel: link.slackChannelId })
    } catch { /* Channel may already be archived */ }
  }

  getDb().prepare('DELETE FROM slack_channel_links WHERE dune_channel_id = ?').run(duneChannelId)
}

export async function syncAllChannelsToSlack(): Promise<{ synced: number; errors: string[] }> {
  const webClient = getWebClient()
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
