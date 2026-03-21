import { config } from '../../config.js'
import { resolve, dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SimpleBox } from '@boxlite-ai/boxlite'

// ── Runtime root ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
export const BACKEND_RUNTIME_ROOT = resolve(__dirname, '..')

// ── resolveBundledAssetDir ──────────────────────────────────────────────
export function resolveBundledAssetDir(relativeDir: string, runtimeRoot = BACKEND_RUNTIME_ROOT): string {
  // Check config-provided paths first (used by Electron packaged mode)
  const configPaths: Record<string, string | undefined> = {
    'agents/skills': config.agentSkillsPath,
    'agent-mcp': config.agentMcpPath,
    'agents/prompts': config.agentPromptsPath,
  }
  const configPath = configPaths[relativeDir]
  if (configPath && existsSync(configPath)) return configPath

  const runtimePath = join(runtimeRoot, relativeDir)
  if (existsSync(runtimePath)) return runtimePath

  const sourcePath = join(resolve(runtimeRoot, '../src'), relativeDir)
  if (existsSync(sourcePath)) return sourcePath

  return configPath || runtimePath
}

export function __resolveBundledAssetDirForTests(relativeDir: string, runtimeRoot?: string): string {
  return resolveBundledAssetDir(relativeDir, runtimeRoot)
}

// ── Constants (mirrors Python SkillBox) ─────────────────────────────────
export const SKILLBOX_IMAGE = 'ghcr.io/boxlite-ai/boxlite-skillbox:0.1.0'
export const SKILLBOX_MEMORY_MIB = 2048
export const SKILLBOX_DISK_SIZE_GB = 10
export const DISPLAY_WIDTH = 1024
export const DISPLAY_HEIGHT = 768
export const DESKTOP_PROCESS_MARKERS = ['xfdesktop', 'xfdesktop4', 'xfce4-panel', 'xfce4-session'] as const
export const STARTUP_WATCHDOG_GRACE_MS = 2_000
export const RUNTIME_SANDBOX_NAME_PREFIX = 'agent-runtime-'
export const RUNTIME_SANDBOX_PENDING_PREFIX = 'pending:'

/** Full PATH inside SkillBox (includes /lsiopy/bin for system Python packages like typing_extensions). */
export const SKILLBOX_PATH = '/config/.local/bin:/lsiopy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

/** MCP server config — written to /config/mcp-servers.json at startup.
 *  Must be a SEPARATE file because the CLI overwrites $HOME/.claude.json with its own state. */
export const MCP_CONFIG_PATH = '/config/mcp-servers.json'
export const AGENT_DUNE_VOLUME_PATH = '/config/.dune'
export const AGENT_DUNE_MEMORY_PATH = `${AGENT_DUNE_VOLUME_PATH}/memory`
export const AGENT_DUNE_MINIAPPS_PATH = `${AGENT_DUNE_VOLUME_PATH}/miniapps`
export const AGENT_DUNE_CLAUDE_PATH = `${AGENT_DUNE_VOLUME_PATH}/.claude`
export const AGENT_DUNE_CLAUDE_STATE_PATH = `${AGENT_DUNE_VOLUME_PATH}/.claude.json`
export const AGENT_DUNE_SYSTEM_PATH = `${AGENT_DUNE_VOLUME_PATH}/system`
export const AGENT_DUNE_COMMUNICATION_PATH = `${AGENT_DUNE_SYSTEM_PATH}/communication`
export const RPC_GUEST_PATH = `${AGENT_DUNE_VOLUME_PATH}/rpc.py`
export const LISTENER_GUEST_PATH = `${AGENT_DUNE_VOLUME_PATH}/listener.py`
export const AGENT_MEMORY_VOLUME_PATH = '/config/memory'
export const AGENT_MINIAPP_VOLUME_PATH = '/config/miniapps'
export const AGENT_CLAUDE_VOLUME_PATH = '/config/.claude'
export const CLAUDE_STATE_PATH = '/config/.claude.json'
export const STOP_AGENT_SHUTDOWN_PROMPT = 'You are being shut down. Save any important information from this session to your memory files in /config/memory/ now. Be concise — you have limited time.'
export const TODO_HANDOFF_MEMORY_PATH = `${AGENT_MEMORY_VOLUME_PATH}/todo-handoff.md`
export const LEADER_THESIS_MEMORY_PATH = `${AGENT_MEMORY_VOLUME_PATH}/leader-thesis.md`
export const TODO_HEARTBEAT_DELAY_MINUTES = 30
export const LISTENER_PROCESS_PATTERN = '[l]istener.py'
export const COMMUNICATION_DAEMON_REFRESH_INTERVAL_MS = 60_000
export const MCP_CONFIG = JSON.stringify({
  mcpServers: {
    computer: {
      command: 'python3',
      args: ['/config/.local/bin/local_computer_mcp.py'],
    },
  },
})

/** System prompt file path inside the container (per-agent, written before each CLI call). */
export const SYSTEM_PROMPT_DIR = '/tmp'
export const AGENT_PROMPTS_SOURCE_DIR = resolveBundledAssetDir('agents/prompts')
export const SYSTEM_PROMPT_TEMPLATE_PATH = join(AGENT_PROMPTS_SOURCE_DIR, 'system.md')
export const NGINX_CONFIG_CANDIDATES = [
  '/etc/nginx/sites-available/default',
  '/etc/nginx/http.d/default.conf',
]
export const NGINX_WEBSOCKET_ANCHOR = '  location /websocket'
export const AGENT_SKILLS_SOURCE_DIR = resolveBundledAssetDir('agents/skills')
export const AGENT_SKILLS_VOLUME_PATH = `${AGENT_CLAUDE_VOLUME_PATH}/skills`
export const CLAUDE_SETTINGS_PATH = `${AGENT_CLAUDE_VOLUME_PATH}/settings.json`

// ── Skill name arrays ───────────────────────────────────────────────────
export const COORDINATION_AGENT_SKILLS = [
  'dune-communication',
  'dune-team-manager',
  'dune-todo',
  'dune-host-operator',
  'dune-slack-connector',
] as const
export const FOLLOWER_AGENT_SKILLS = [
  ...COORDINATION_AGENT_SKILLS,
  'dune-miniapp-builder',
  'dune-sandbox-operator',
] as const
export const LEADER_AGENT_SKILLS = [
  ...COORDINATION_AGENT_SKILLS,
  'dune-leader',
] as const
export const AGENT_SKILLS = [
  ...FOLLOWER_AGENT_SKILLS,
  ...LEADER_AGENT_SKILLS,
] as const
export const BUILTIN_AGENT_SKILLS = AGENT_SKILLS

// ── Nginx location blocks ───────────────────────────────────────────────
export const AGENT_SKILL_FINGERPRINT_FILE = '.dune-source-fingerprint'
export const MINIAPP_LOCATION_BLOCK = [
  '  location /miniapps/ {',
  '    alias                   /config/miniapps/;',
  '    autoindex               off;',
  '    add_header              Cache-Control "no-store";',
  '    try_files               $uri $uri/ =404;',
  '  }',
].join('\n')
export const WEBRTC_LOCATION_BLOCK = [
  '  location /webrtc {',
  '    proxy_set_header        Upgrade $http_upgrade;',
  '    proxy_set_header        Connection "upgrade";',
  '    proxy_set_header        Host $host;',
  '    proxy_http_version      1.1;',
  '    proxy_read_timeout      3600s;',
  '    proxy_send_timeout      3600s;',
  '    proxy_connect_timeout   3600s;',
  '    proxy_buffering         off;',
  '    proxy_pass              http://127.0.0.1:8082;',
  '  }',
].join('\n')

// ── Watchdog / timing ───────────────────────────────────────────────────
/** Max time an agent can stay in "thinking" before watchdog resets it. */
export const THINKING_WATCHDOG_MS = 330_000  // 5.5 min (300s CLI timeout + 30s buffer)

// ── Managed env keys ────────────────────────────────────────────────────
export const MANAGED_ENV_KEYS: (keyof ClaudeSettingsEnvValues)[] = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]

// ── Todo reminder constants ─────────────────────────────────────────────
export const TODO_REMINDER_COOLDOWN_MS = 5 * 60_000 // 5 minutes
export const TODO_REMINDER_SWEEP_INTERVAL_MS = 60_000 // 60 seconds

export const LEADER_PDCA_TEMPLATE_LINES = [
  'Leader PDCA',
  'Thesis: unchanged|revised',
  'Plan: owner=<agent|human>; deliverable=<one sentence>; due=<time|none>; success=<one sentence>',
  'Do: <delegation/reassignment/escalation action taken this turn>',
  'Check: <current evidence or status against success criteria>',
  'Act: <next concrete control action>',
  'Obstacle: cleared|rerouted|escalated|exhausted',
  'Outcome: advanced|blocked',
] as const

export const LEADER_ALLOWED_READ_ONLY_TOOL_NAMES = new Set([
  'Bash',
  'Read',
  'Glob',
  'Grep',
  'LS',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
  'KillBash',
  'Skill',
])

export const LEADER_MUTATING_TOOL_NAMES = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'Task',
  'computer',
])

// ── Passive wait pattern ────────────────────────────────────────────────
export const PASSIVE_WAIT_PATTERN = /\b(wait\s+for|waiting\s+for|await\s+user|now\s+waiting|idle\s+until|just\s+wait)\b/i

// ── Types ───────────────────────────────────────────────────────────────
export type SkillInfo = {
  name: string
  description: string
  preview: string
  scripts: string[]
  markdown: string
}

export type BuiltinSkillName = typeof AGENT_SKILLS[number]

export type ClaudeSettingsEnvValues = {
  ANTHROPIC_AUTH_TOKEN?: string
  ANTHROPIC_BASE_URL?: string
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: string
}

export type ClaudeCliAuthEnvValues = {
  ANTHROPIC_API_KEY?: string
  CLAUDE_CODE_OAUTH_TOKEN?: string
}

export type ClaudeSettingsSyncAgentResult = {
  agentId: string
  name: string
  wasRunning: boolean
  startedForSync: boolean
  updated: boolean
  stoppedAfterSync: boolean
  error?: string
  stopError?: string
}

export type ClaudeSettingsSyncSummary = {
  total: number
  updated: number
  failed: number
  restoredStopped: number
  results: ClaudeSettingsSyncAgentResult[]
}

export type MiniappNginxPatchResult = {
  text: string
  changed: boolean
}

export type RuntimeVolumeSpec = {
  hostPath: string
  guestPath: string
  readOnly?: boolean
}

export type AgentRuntimeHostPaths = {
  duneRootHostPath: string
  memoryHostPath: string
  miniappHostPath: string
  claudeHostPath: string
  claudeStateHostPath: string
  communicationHostPath: string
}

export interface RunningAgent {
  box: SimpleBox
  agent: import('@dune/shared').Agent
  sandboxId: string
  guiHttpPort: number
  guiHttpsPort: number
  backendUrl: string
  daemonAssetHash?: string
  cliInstalled: boolean
  hasSession: boolean
  sessionId: string | null
  startedAt: number
  thinkingSince: number  // timestamp when agent entered thinking state, 0 if not thinking
  currentExecution: { kill: () => Promise<void> } | null
  interruptRequested: boolean
  interruptAbort: { promise: Promise<void>; resolve: () => void } | null
}

export type DesktopReadinessDiagnostics = {
  probeCount: number
  lastExitCode: number | null
  lastStdout: string
  lastStderr: string
  lastError: string | null
  lastTimeout: boolean
  lastMatchedMarker: string | null
}

export type DesktopReadinessResult = {
  probeCount: number
  matchedMarker: string
}

export type CommunicationDaemonAssetSyncResult = {
  rootHostPath: string
  assetHash: string
  changed: boolean
}

export type CommunicationDaemonProcessStatus = {
  listenerRunning: boolean
}

export type ReconcileCommunicationDaemonsOptions = {
  wsUrl: string
  daemonAssetHash: string
  force?: boolean
}

export type RuntimeLogChannel = 'stdout' | 'stderr' | 'lifecycle' | 'status'

export type TodoReminderKind = 'idle' | 'overdue' | 'no-pending'
export type TodoReminderPayload = { kind: TodoReminderKind; content: string }
export type TodoReminderEnqueue = (agentId: string, payload: TodoReminderPayload, remindedAt: number) => void
export type TodoReminderMetadata = { kind: TodoReminderKind; remindedAt: number }

export type LeaderPdca = {
  thesis: 'unchanged' | 'revised'
  plan: {
    owner: string
    deliverable: string
    due: string
    success: string
  }
  do: string
  check: string
  act: string
  obstacle: 'cleared' | 'rerouted' | 'escalated' | 'exhausted'
  outcome: 'advanced' | 'blocked'
}

export type LeaderToolUse = {
  toolName: string
  input: unknown
}

export type LeaderPolicyViolation = {
  toolName: string
  reason: string
}

export type TodoReminderTurnResolution = {
  consumeCooldown: boolean
  allowImmediateRequeue: boolean
  pdca: LeaderPdca | null
  policyViolation: LeaderPolicyViolation | null
}

export type BuildClaudeCliCommandInput = {
  agentId: string
  promptFile: string
  systemPromptFile: string
  hasSession: boolean
  oauthToken: string
  modelId: string | null
  wsUrl: string
  permissionMode?: 'plan'
  sessionId?: string
  resumeSessionId?: string
}

export interface InputMetadata {
  source?: 'dm' | 'channel' | 'mailbox' | 'app_action' | 'slack'
  /** For channel input: structured data about which channels and messages the agent received */
  channels?: Array<{ name: string; messages: Array<{ author: string; content: string }> }>
  /** For DM: the user's message content */
  content?: string
  /** For DM correlation between the frontend stash queue and the emitted user_message log entry. */
  clientRequestId?: string
  /** For mailbox notifications: summary of the leased unread batch. */
  mailbox?: {
    unreadCount: number
    batchId?: string
    expiresAt?: number
  }
  /** For miniapp action requests from the popup host. */
  appAction?: {
    slug: string
    action: string
    payload?: unknown
    requestId?: string
  }
  /** Internal metadata for idle reminder turns. */
  todoReminder?: TodoReminderMetadata
}
