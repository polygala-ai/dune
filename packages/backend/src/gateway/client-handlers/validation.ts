import type {
  AgentRoleType,
  AgentWorkModeType,
  ClaudeSettingsUpdate,
  HostOperatorApprovalModeType,
  SelectedModelProvider,
} from '@dune/shared'
import * as agentStore from '../../storage/agent-store.js'
import * as mailboxService from '../../domains/agents/mailbox.js'
import type { InputMetadata } from '../../domains/agents/constants.js'
import { join } from 'node:path'
import { config } from '../../config.js'

// ── Validation helpers ───────────────────────────────────────────────

export const CLAUDE_MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/
export const START_ALL_MAX_CONCURRENCY = 4
export const START_ALL_TIMEOUT_GRACE_MS = 2_000

export function normalizeAgentRole(value: unknown): AgentRoleType {
  if (value === 'leader' || value === 'follower') return value
  throw new Error('invalid_agent_role')
}

export function normalizeAgentWorkMode(value: unknown): AgentWorkModeType {
  if (value === 'normal' || value === 'plan-first') return value
  throw new Error('invalid_agent_work_mode')
}

export function normalizeClaudeModelId(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('invalid_model_id')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!CLAUDE_MODEL_ID_PATTERN.test(trimmed)) throw new Error('invalid_model_id')
  return trimmed
}

export function normalizeHostOperatorApprovalMode(value: unknown): HostOperatorApprovalModeType {
  if (value === 'approval-required' || value === 'dangerously-skip') return value
  throw new Error('invalid_host_operator_approval_mode')
}

export function normalizeStringArray(value: unknown, errorMessage: string): string[] {
  if (!Array.isArray(value)) throw new Error(errorMessage)
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
}

export function isNoResponse(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === '[NO_RESPONSE]' || trimmed.endsWith('[NO_RESPONSE]')
}

export function getAgentMaps() {
  const allAgents = agentStore.listAgents()
  return {
    allAgents,
    agentMap: new Map(allAgents.map((agent) => [agent.id, agent])),
  }
}

export function getAuthorName(agentMap: Map<string, { name: string }>, authorId: string): string {
  return agentMap.get(authorId)?.name || (authorId === 'system' ? 'System' : 'User')
}

export function buildChannelInputMetadata(
  agentMap: Map<string, { name: string }>,
  channels: mailboxService.MailboxChannelMessages[],
): InputMetadata {
  return {
    source: 'channel',
    channels: channels.map((channel) => ({
      name: channel.channelName,
      messages: channel.messages.map((message) => ({
        author: getAuthorName(agentMap, message.authorId),
        content: message.content,
      })),
    })),
  }
}

export function buildMailboxPrompt(unreadCount: number): string {
  const label = unreadCount === 1 ? 'message' : 'messages'
  return [
    `You have ${unreadCount} unread ${label} in your mailbox.`,
    'Use the mailbox endpoints on the local Dune proxy to inspect the unread batch yourself.',
    'After you respond, or decide nothing needs a reply, acknowledge the fetched batch.',
    'Do not fetch channel history unless you intentionally want older context.',
  ].join('\n')
}

export function appendTeamRoster(promptParts: string[], allAgents: Array<{ id: string; name: string; personality: string; role: AgentRoleType }>, agentId: string): void {
  const otherAgents = allAgents.filter((agent) => agent.id !== agentId)
  if (otherAgents.length === 0) return
  const roster = otherAgents.map((agent) => `${agent.name} [${agent.role}] (${agent.personality.split('.')[0]})`).join(', ')
  promptParts.push(`[Team members: ${roster}]`)
}

export function getMemoryDir(agentId: string): string {
  return join(config.agentsRoot, agentId, '.dune', 'memory')
}

export function safeRelativePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.includes('..') || normalized.includes('\0')) return null
  return normalized
}

const CLAUDE_SETTINGS_KEYS = new Set([
  'selectedModelProvider',
  'defaultModelId',
  'anthropicApiKey',
  'claudeCodeOAuthToken',
  'anthropicAuthToken',
  'anthropicBaseUrl',
  'claudeCodeDisableNonessentialTraffic',
])
const SELECTED_MODEL_PROVIDERS = new Set<SelectedModelProvider | null>(['claude', null])

export function parseClaudeSettingsUpdate(body: unknown): { value: ClaudeSettingsUpdate | null; error: string | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { value: null, error: 'Invalid JSON body' }
  }
  const patch: ClaudeSettingsUpdate = {}
  for (const [key, rawValue] of Object.entries(body as Record<string, unknown>)) {
    if (!CLAUDE_SETTINGS_KEYS.has(key)) return { value: null, error: `Unknown field: ${key}` }
    if (rawValue !== null && typeof rawValue !== 'string') return { value: null, error: `Field ${key} must be a string or null` }
    if (key === 'selectedModelProvider') {
      const normalized = rawValue == null ? null : (rawValue as string).trim() || null
      if (!SELECTED_MODEL_PROVIDERS.has(normalized as SelectedModelProvider | null)) return { value: null, error: `Field ${key} must be one of: claude` }
      ;(patch as Record<string, string | null>)[key] = normalized
      continue
    }
    if (key === 'defaultModelId') {
      const normalized = rawValue == null ? null : (rawValue as string).trim() || null
      if (normalized && !CLAUDE_MODEL_ID_PATTERN.test(normalized)) return { value: null, error: `Field ${key} must be a valid Claude model alias or id` }
      ;(patch as Record<string, string | null>)[key] = normalized
      continue
    }
    ;(patch as Record<string, string | null>)[key] = rawValue as string | null
  }
  return { value: patch, error: null }
}
