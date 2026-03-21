import type {
  AgentRoleType,
  AgentWorkModeType,
  HostOperatorApprovalModeType,
  SandboxActorTypeType,
} from '@dune/shared'
import {
  HostDirectoryPickerError,
  pickHostDirectory,
  type HostDirectoryPickResult,
} from '../utils/host-directory-picker.js'
import * as agentManager from '../agents/agent-manager.js'

const CLAUDE_MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

export function isNoResponse(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === '[NO_RESPONSE]' || trimmed.endsWith('[NO_RESPONSE]')
}

export async function readOptionalJsonBody(c: any): Promise<any> {
  const raw = await c.req.raw.text()
  if (!raw.trim()) return null
  return JSON.parse(raw)
}

export function normalizeHostOperatorApprovalMode(value: unknown): HostOperatorApprovalModeType {
  if (value === 'approval-required' || value === 'dangerously-skip') return value
  throw new Error('invalid_host_operator_approval_mode')
}

export function normalizeStringArray(value: unknown, errorMessage: string): string[] {
  if (!Array.isArray(value)) throw new Error(errorMessage)
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
}

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

export type ActorIdentity = {
  actorType: SandboxActorTypeType
  actorId: string
}

export function parseActor(c: any): ActorIdentity {
  const actorTypeRaw = c.req.header('X-Actor-Type')
  const actorIdRaw = c.req.header('X-Actor-Id')
  const actorType = actorTypeRaw === 'human' || actorTypeRaw === 'agent' || actorTypeRaw === 'system'
    ? actorTypeRaw
    : null
  const actorId = typeof actorIdRaw === 'string' ? actorIdRaw.trim() : ''

  if (!actorType || !actorId) {
    throw new Error('missing_actor_identity')
  }

  return { actorType, actorId }
}

export function mapAgentMountErrorToResponse(c: any, err: any) {
  const message = String(err?.message || 'mount_error')
  if (message === 'invalid_host_path') return c.json({ error: message }, 400)
  if (message === 'host_path_not_found') return c.json({ error: message }, 400)
  if (message === 'invalid_guest_path') return c.json({ error: message }, 400)
  if (message === 'guest_path_outside_workspace') return c.json({ error: message }, 400)
  if (message === 'reserved_guest_path_conflict') return c.json({ error: message }, 400)
  if (message === 'guest_path_conflict') return c.json({ error: message }, 409)
  return c.json({ error: message }, 400)
}

export function mapHostOperatorErrorToResponse(c: any, err: any) {
  const message = String(err?.message || 'host_operator_error')
  if (message === 'missing_actor_identity') return c.json({ error: message }, 401)
  if (message === 'forbidden') return c.json({ error: message }, 403)
  if (message === 'bundle_id_not_allowed' || message === 'path_not_allowed') return c.json({ error: message }, 403)
  if (message === 'host_operator_unavailable') return c.json({ error: message }, 503)
  if (message === 'bundle_id_required') return c.json({ error: message }, 400)
  if (message === 'path_required') return c.json({ error: message }, 400)
  if (message === 'path_must_be_absolute') return c.json({ error: message }, 400)
  if (message === 'path_not_found') return c.json({ error: message }, 400)
  if (message === 'parent_path_not_found') return c.json({ error: message }, 400)
  if (message === 'point_required') return c.json({ error: message }, 400)
  if (message === 'to_point_required') return c.json({ error: message }, 400)
  if (message === 'query_required') return c.json({ error: message }, 400)
  if (message === 'text_required') return c.json({ error: message }, 400)
  if (message === 'key_required') return c.json({ error: message }, 400)
  if (message === 'url_required') return c.json({ error: message }, 400)
  if (message === 'invalid_host_operator_request') return c.json({ error: message }, 400)
  if (message === 'request_not_pending') return c.json({ error: message }, 409)
  return c.json({ error: message }, 400)
}

export type EnsureAgentRunningFn = typeof agentManager.ensureAgentRunning
let ensureAgentRunningImpl: EnsureAgentRunningFn = (agentId) => agentManager.ensureAgentRunning(agentId)

export type PickHostDirectoryFn = () => Promise<HostDirectoryPickResult>
let pickHostDirectoryImpl: PickHostDirectoryFn = () => pickHostDirectory()

export function getEnsureAgentRunningImpl() { return ensureAgentRunningImpl }
export function getPickHostDirectoryImpl() { return pickHostDirectoryImpl }

export function __setEnsureAgentRunningForTests(fn: EnsureAgentRunningFn | null): void {
  ensureAgentRunningImpl = fn ?? ((agentId: string) => agentManager.ensureAgentRunning(agentId))
}

export function __setPickHostDirectoryForTests(fn: PickHostDirectoryFn | null): void {
  pickHostDirectoryImpl = fn ?? (() => pickHostDirectory())
}

export { HostDirectoryPickerError }
