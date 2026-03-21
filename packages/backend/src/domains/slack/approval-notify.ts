import * as slackSettingsStore from '../../storage/slack-settings-store.js'
import * as agentStore from '../../storage/agent-store.js'
import type { HostOperatorRequest } from '@dune/shared'
import {
  getWebClient,
  getAgentSlackThread,
  resolveSlackUserName,
} from './connection.js'

// Track posted approval messages: requestId -> array of posted messages (may be in multiple channels)
const approvalMessages = new Map<string, Array<{ ts: string; channelId: string }>>()

// Lazy import to avoid circular dependency
let _hostOperatorService: typeof import('../host/gui-service.js') | null = null
async function getHostOperatorService() {
  if (!_hostOperatorService) {
    _hostOperatorService = await import('../host/gui-service.js')
  }
  return _hostOperatorService
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

export async function postApprovalRequest(request: HostOperatorRequest): Promise<void> {
  const webClient = getWebClient()
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
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'host_op_approve',
          value: request.requestId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
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
  const webClient = getWebClient()
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

export async function handleInteractiveAction(body: any): Promise<void> {
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

export async function handleTextApproval(slackUserId: string, text: string): Promise<boolean> {
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
