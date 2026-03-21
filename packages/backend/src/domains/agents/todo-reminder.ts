import * as agentStore from '../../storage/agent-store.js'
import * as todoStore from '../../storage/todo-store.js'
import { isValidDueAtMs } from './due-at.js'
import type { Agent, Todo } from '@dune/shared'
import {
  TODO_HANDOFF_MEMORY_PATH,
  LEADER_THESIS_MEMORY_PATH,
  TODO_HEARTBEAT_DELAY_MINUTES,
  TODO_REMINDER_COOLDOWN_MS,
  TODO_REMINDER_SWEEP_INTERVAL_MS,
  LEADER_PDCA_TEMPLATE_LINES,
  LEADER_ALLOWED_READ_ONLY_TOOL_NAMES,
  LEADER_MUTATING_TOOL_NAMES,
  PASSIVE_WAIT_PATTERN,
} from './constants.js'
import type {
  TodoReminderKind,
  TodoReminderPayload,
  TodoReminderEnqueue,
  TodoReminderMetadata,
  LeaderPdca,
  LeaderToolUse,
  LeaderPolicyViolation,
  TodoReminderTurnResolution,
} from './constants.js'
import { runningAgents, agentLocks } from './runtime-state.js'

// Per-agent cooldown for idle todo reminders (prevents infinite DM loops)
export const todoReminderCooldowns = new Map<string, number>()

// Forward reference to sendMessage — set by messaging.ts to avoid circular dependency
let _sendMessage: ((agentId: string, messages: Array<{ authorName: string; content: string }>, metadata?: any) => Promise<string>) | null = null

export function __setSendMessageDep(fn: typeof _sendMessage): void {
  _sendMessage = fn
}

export function formatTodoForReminder(todo: Todo): string {
  const lines = [
    `- "${todo.title}" (id: ${todo.id}, due ${new Date(todo.dueAt).toLocaleString()})`,
    `  originalTitle: ${JSON.stringify(todo.originalTitle)}`,
  ]
  if (todo.originalDescription) lines.push(`  originalDescription: ${JSON.stringify(todo.originalDescription)}`)
  if (todo.description && todo.description !== todo.originalDescription) {
    lines.push(`  currentDescription: ${JSON.stringify(todo.description)}`)
  }
  if (todo.nextPlan) lines.push(`  nextPlan: ${JSON.stringify(todo.nextPlan)}`)
  return lines.join('\n')
}

export function getLeaderPdcaFooterInstructions(): string[] {
  return [
    '- End your reply with this exact footer:',
    ...LEADER_PDCA_TEMPLATE_LINES,
  ]
}

export function buildLeaderIdleTodoReminder(agent: Agent, pending: Todo[]): TodoReminderPayload {
  const activeTodo = pending[0]
  const activeTodoSummary = activeTodo
    ? [
        `Active todo: "${activeTodo.title}" (id: ${activeTodo.id})`,
        `Original request: ${JSON.stringify(activeTodo.originalTitle)}`,
        activeTodo.originalDescription ? `Original details: ${JSON.stringify(activeTodo.originalDescription)}` : null,
        activeTodo.nextPlan ? `Current nextPlan: ${JSON.stringify(activeTodo.nextPlan)}` : 'Current nextPlan: (empty)',
      ].filter(Boolean).join('\n')
    : 'Active todo: none'

  return {
    kind: 'idle',
    content: [
      `You are idle as the ${agent.role}. Use dune-leader now.`,
      '',
      'Pending coordination todos:',
      pending.map(formatTodoForReminder).join('\n'),
      '',
      activeTodoSummary,
      '',
      'Run one leader-only PDCA cycle:',
      '- Reassess the mission from available evidence.',
      `- Revise ${LEADER_THESIS_MEMORY_PATH} only if the mission materially changed.`,
      '- Select one objective and define the owner, deliverable, due time, and success criteria.',
      '- Delegate or reassign the work through a follower-owned todo plus a concise instruction message.',
      '- Review follower replies, todo state, or delivered artifacts against the stated success criteria.',
      '- Accept, redirect, escalate, or reassign based on that review.',
      '- Do not implement directly yourself. If no suitable follower exists, create or recruit one before delegating.',
      `- Use nextPlan and ${TODO_HANDOFF_MEMORY_PATH} only as optional operational notes after the cycle.`,
      '- Before claiming Outcome: blocked, exhaust obstacle-removal in order: re-scope, reassign, recruit, gather context, reroute, escalate sideways, then escalate to human as last resort.',
      '- If you escalate to a human, also assign any parallelizable work and set a concrete follow-up action.',
      '- Do not passively wait after escalation.',
      ...getLeaderPdcaFooterInstructions(),
      'Use your dune-leader skill plus dune-communication, dune-team-manager, dune-todo, or the local Dune API as needed.',
    ].join('\n'),
  }
}

export function buildFollowerIdleTodoReminder(agent: Agent, pending: Todo[]): TodoReminderPayload {
  return {
    kind: 'idle',
    content: [
      `You are idle as the ${agent.role}. Preserve the original todo request before you pause.`,
      '',
      'Pending todos:',
      pending.map(formatTodoForReminder).join('\n'),
      '',
      'Before you drift:',
      '- Preserve originalTitle and originalDescription exactly. They are the immutable original request snapshot.',
      '- Put progress in title, description, nextPlan, or memory instead of overwriting the original request snapshot.',
      `- Refresh ${TODO_HANDOFF_MEMORY_PATH} with an "Original Request Snapshot" that lists each pending todo ID, the original request, and any current working notes.`,
      `- If you no longer have a pending heartbeat, create one due about ${TODO_HEARTBEAT_DELAY_MINUTES} minutes from now.`,
      'Use your dune-todo skill and the local Dune API.',
    ].join('\n'),
  }
}

export function buildOverdueTodoReminder(agent: Agent, overdue: Todo[]): TodoReminderPayload {
  const roleSpecificTail = agent.role === 'leader'
    ? [
        '- Use dune-leader to run one follow-up PDCA cycle after triage.',
        `- Revise ${LEADER_THESIS_MEMORY_PATH} only if the mission materially changed.`,
        '- Treat overdue leader todos as coordination follow-ups, not implementation work.',
        '- Follow up with the owner, reassign, escalate, or recruit a follower if none is suitable.',
        '- Do not implement directly yourself.',
        `- Use nextPlan and ${TODO_HANDOFF_MEMORY_PATH} only as optional operational notes after the cycle.`,
        '- Before claiming Outcome: blocked, exhaust obstacle-removal in order: re-scope, reassign, recruit, gather context, reroute, escalate sideways, then escalate to human as last resort.',
        '- If you escalate to a human, also assign any parallelizable work and set a concrete follow-up action.',
        '- Do not passively wait after escalation.',
        ...getLeaderPdcaFooterInstructions(),
      ]
    : [
        '- After you triage the overdue todo(s), preserve originalTitle and originalDescription for any remaining pending work.',
        `- Refresh ${TODO_HANDOFF_MEMORY_PATH} with the original request snapshot for the pending work that remains.`,
      ]

  return {
    kind: 'overdue',
    content: [
      `You are idle as the ${agent.role} and you have ${overdue.length} overdue todo(s):`,
      overdue.map(formatTodoForReminder).join('\n'),
      '',
      'Triage them now:',
      '- Mark completed work done or reschedule it with a new dueAt.',
      ...roleSpecificTail,
      `Use your ${agent.role === 'leader' ? 'dune-leader skill plus dune-communication, dune-team-manager, dune-todo, or the local Dune API' : 'dune-todo skill and the local Dune API'}.`,
    ].join('\n'),
  }
}

export function buildNoPendingTodoReminder(agent: Agent): TodoReminderPayload {
  const roleSpecificTail = agent.role === 'leader'
    ? [
        '- Use dune-leader to reassess the mission and pick one delegable objective now.',
        `- Revise ${LEADER_THESIS_MEMORY_PATH} only if the mission materially changed.`,
        '- Define the owner, deliverable, due time, and success criteria for that objective.',
        '- If no suitable follower exists, create or recruit one before delegating.',
        '- Assign the work through a follower-owned todo plus a concise instruction message.',
        '- Do not implement directly yourself.',
        `- Use nextPlan and ${TODO_HANDOFF_MEMORY_PATH} only as optional operational notes after the cycle.`,
        '- Before claiming Outcome: blocked, exhaust obstacle-removal in order: re-scope, reassign, recruit, gather context, reroute, escalate sideways, then escalate to human as last resort.',
        '- If you escalate to a human, also assign any parallelizable work and set a concrete follow-up action.',
        '- Do not passively wait after escalation.',
        ...getLeaderPdcaFooterInstructions(),
      ]
    : [
        '- Treat the title and description you create as the original request snapshot for the new heartbeat todo.',
        `- Refresh ${TODO_HANDOFF_MEMORY_PATH} with the original request snapshot for the new todo.`,
      ]

  return {
    kind: 'no-pending',
    content: [
      `You are idle as the ${agent.role} and you have no pending todos.`,
      ...(agent.role === 'leader'
        ? roleSpecificTail
        : [
            `Create a new pending heartbeat todo due about ${TODO_HEARTBEAT_DELAY_MINUTES} minutes from now.`,
            '- The todo title and description become the immutable original request snapshot automatically.',
            ...roleSpecificTail,
          ]),
      `Use your ${agent.role === 'leader' ? 'dune-leader skill plus dune-communication, dune-team-manager, dune-todo, or the local Dune API' : 'dune-todo skill and the local Dune API'}.`,
    ].join('\n'),
  }
}

export function parseLeaderPdca(response: string): LeaderPdca | null {
  const lines = response
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 8) return null

  const footer = lines.slice(-8)
  if (!/^Leader PDCA$/i.test(footer[0] || '')) return null

  const thesisMatch = (footer[1] || '').match(/^Thesis:\s*(unchanged|revised)$/i)
  const planMatch = (footer[2] || '').match(/^Plan:\s*owner=(.+?);\s*deliverable=(.+?);\s*due=(.+?);\s*success=(.+)$/i)
  const doMatch = (footer[3] || '').match(/^Do:\s*(.+)$/i)
  const checkMatch = (footer[4] || '').match(/^Check:\s*(.+)$/i)
  const actMatch = (footer[5] || '').match(/^Act:\s*(.+)$/i)
  const obstacleMatch = (footer[6] || '').match(/^Obstacle:\s*(cleared|rerouted|escalated|exhausted)$/i)
  const outcomeMatch = (footer[7] || '').match(/^Outcome:\s*(advanced|blocked)$/i)

  if (!thesisMatch || !planMatch || !doMatch || !checkMatch || !actMatch || !obstacleMatch || !outcomeMatch) return null

  const owner = planMatch[1]?.trim() || ''
  const deliverable = planMatch[2]?.trim() || ''
  const due = planMatch[3]?.trim() || ''
  const success = planMatch[4]?.trim() || ''
  const doStep = doMatch[1]?.trim() || ''
  const check = checkMatch[1]?.trim() || ''
  const act = actMatch[1]?.trim() || ''
  const obstacle = obstacleMatch[1].toLowerCase() as LeaderPdca['obstacle']
  const outcome = outcomeMatch[1].toLowerCase() as LeaderPdca['outcome']

  if (!owner || !deliverable || !due || !success || !doStep || !check || !act) return null

  // Outcome: blocked is valid only with Obstacle: exhausted
  if (outcome === 'blocked' && obstacle !== 'exhausted') return null

  // Passive wait wording in Do or Act is invalid
  if (PASSIVE_WAIT_PATTERN.test(doStep) || PASSIVE_WAIT_PATTERN.test(act)) return null

  return {
    thesis: thesisMatch[1].toLowerCase() as LeaderPdca['thesis'],
    plan: {
      owner,
      deliverable,
      due,
      success,
    },
    do: doStep,
    check,
    act,
    obstacle,
    outcome,
  }
}

export function extractLeaderBashCommand(input: unknown): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object') {
    for (const key of ['command', 'cmd', 'script', 'text', 'input']) {
      const value = (input as Record<string, unknown>)[key]
      if (typeof value === 'string') return value
    }
  }
  return JSON.stringify(input ?? '')
}

export function isLeaderMemoryOnlyCommand(command: string): boolean {
  const normalized = command.toLowerCase()
  if (!/(\/config\/memory\/leader-thesis\.md|\/config\/memory\/todo-handoff\.md)/.test(normalized)) {
    return false
  }
  return !/(\/workspace|packages\/|src\/|dist\/|\/config\/miniapps)/.test(normalized)
}

export function isLeaderCoordinationShellCommand(command: string): boolean {
  const normalized = command.toLowerCase()
  if (/\/skills\/dune-(communication|team-manager|todo)\//.test(normalized)) return true
  if (/(localhost|127\.0\.0\.1):3200/.test(normalized)) {
    return !/(\/host\/v1\/exec|\/sandboxes\/v1|\/miniapps\/)/.test(normalized)
  }
  return isLeaderMemoryOnlyCommand(command)
}

export function isLeaderReadOnlyShellCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim()
  const readOnlyPrefixes = [
    'ls', 'pwd', 'cat', 'rg', 'grep', 'find', 'sed -n', 'head', 'tail', 'wc',
    'stat', 'date', 'printenv', 'env', 'ps', 'jq', 'curl ', 'python3 -c "import json',
  ]
  if (!readOnlyPrefixes.some(prefix => normalized.startsWith(prefix))) return false
  return !detectLeaderShellMutation(command)
}

export function detectLeaderShellMutation(command: string): string | null {
  const normalized = command.toLowerCase()
  if (/\b(rm|mv|cp|mkdir|touch|chmod|chown|patch|make|pnpm|npm|yarn)\b/.test(normalized)) {
    return 'mutating shell command'
  }
  if (/git\s+(apply|commit|checkout|merge|rebase)\b/.test(normalized)) {
    return 'git mutation command'
  }
  if (/sed\s+-i\b|perl\s+-pi\b|write_text\(|write_bytes\(|open\([^)]*,\s*['"][wa]/.test(normalized)) {
    return 'file mutation command'
  }
  const redirectMatch = command.match(/(^|[^0-9])>>?\s*([^\s]+)/)
  if (redirectMatch) {
    const target = redirectMatch[2]?.trim() || ''
    if (!/^\/config\/memory\/(leader-thesis|todo-handoff)\.md$/.test(target)) {
      return `redirected write to ${target}`
    }
  }
  return null
}

export function detectLeaderPolicyViolation(toolUses: LeaderToolUse[]): LeaderPolicyViolation | null {
  for (const toolUse of toolUses) {
    const toolName = (toolUse.toolName || '').trim()
    if (!toolName) continue

    if (toolName === 'Bash') {
      const command = extractLeaderBashCommand(toolUse.input)
      if (isLeaderCoordinationShellCommand(command) || isLeaderReadOnlyShellCommand(command)) {
        continue
      }
      const mutationReason = detectLeaderShellMutation(command)
      return {
        toolName,
        reason: mutationReason
          ? `Direct implementation shell work is not allowed for leaders: ${mutationReason}.`
          : 'Leaders may only use Bash for read-only inspection, coordination commands, or leader memory updates.',
      }
    }

    if (LEADER_ALLOWED_READ_ONLY_TOOL_NAMES.has(toolName)) continue

    if (LEADER_MUTATING_TOOL_NAMES.has(toolName)) {
      return {
        toolName,
        reason: `Direct implementation tool use is not allowed for leaders: ${toolName}.`,
      }
    }

    return {
      toolName,
      reason: `Leaders may only use coordination or read-only tools, but used ${toolName}.`,
    }
  }

  return null
}

export function finalizeTodoReminderTurn(
  agentId: string,
  agent: Pick<Agent, 'role'>,
  reminder: TodoReminderMetadata | undefined,
  response: string,
  policyViolation: LeaderPolicyViolation | null = null,
): TodoReminderTurnResolution {
  if (!reminder) {
    return { consumeCooldown: false, allowImmediateRequeue: true, pdca: null, policyViolation }
  }

  if (agent.role !== 'leader') {
    return { consumeCooldown: false, allowImmediateRequeue: true, pdca: null, policyViolation }
  }

  const pdca = parseLeaderPdca(response)
  const consumeCooldown = !policyViolation && pdca?.outcome === 'advanced'
  if (consumeCooldown) {
    todoReminderCooldowns.set(agentId, reminder.remindedAt)
  }

  return {
    consumeCooldown,
    allowImmediateRequeue: false,
    pdca,
    policyViolation,
  }
}

export function buildTodoReminderPayload(agentId: string, now: number): TodoReminderPayload | null {
  const lastReminder = todoReminderCooldowns.get(agentId) || 0
  if (now - lastReminder <= TODO_REMINDER_COOLDOWN_MS) return null

  const agent = agentStore.getAgent(agentId)
  if (!agent) return null
  if (!agent.keepAlive) return null
  const pending = todoStore.getPendingTodosByAgent(agentId)
  const overdue = pending.filter(t => t.dueAt !== undefined && isValidDueAtMs(t.dueAt) && t.dueAt <= now)
  if (overdue.length > 0) {
    return buildOverdueTodoReminder(agent, overdue)
  }

  if (pending.length === 0) {
    return buildNoPendingTodoReminder(agent)
  }

  return agent.role === 'leader'
    ? buildLeaderIdleTodoReminder(agent, pending)
    : buildFollowerIdleTodoReminder(agent, pending)
}

const defaultTodoReminderEnqueue: TodoReminderEnqueue = (agentId, payload, remindedAt) => {
  if (!_sendMessage) {
    console.warn('[todo-reminder] sendMessage not initialized yet')
    return
  }
  _sendMessage(agentId, [{ authorName: 'System', content: payload.content }], {
    todoReminder: { kind: payload.kind, remindedAt },
  }).catch(err => {
    const action = payload.kind === 'overdue' ? 'remind' : 'nudge'
    console.warn(`[todo-idle] Failed to ${action} agent ${agentId}:`, err.message)
  })
}

let enqueueTodoReminder: TodoReminderEnqueue = defaultTodoReminderEnqueue

export function queueTodoReminderIfNeeded(
  agentId: string,
  options: { now?: number; requireUnlocked?: boolean } = {},
): boolean {
  if (options.requireUnlocked && agentLocks.has(agentId)) return false
  const agentStatus = agentStore.getAgent(agentId)?.status
  if (agentStatus === 'stopping' || agentStatus === 'stopped') return false
  const now = options.now ?? Date.now()
  const payload = buildTodoReminderPayload(agentId, now)
  if (!payload) return false
  if (agentStore.getAgent(agentId)?.role !== 'leader') {
    todoReminderCooldowns.set(agentId, now)
  }
  enqueueTodoReminder(agentId, payload, now)
  return true
}

const todoReminderSweepTimer = setInterval(() => {
  for (const [agentId, running] of runningAgents) {
    if (!running.hasSession) continue
    queueTodoReminderIfNeeded(agentId, { requireUnlocked: true })
  }
}, TODO_REMINDER_SWEEP_INTERVAL_MS)
todoReminderSweepTimer.unref()

// ── Test exports ────────────────────────────────────────────────────────

export function __parseLeaderPdcaForTests(response: string): LeaderPdca | null {
  return parseLeaderPdca(response)
}

export function __detectLeaderPolicyViolationForTests(toolUses: LeaderToolUse[]): LeaderPolicyViolation | null {
  return detectLeaderPolicyViolation(toolUses)
}

export function __finalizeTodoReminderTurnForTests(
  agentId: string,
  role: Agent['role'],
  reminder: TodoReminderMetadata | undefined,
  response: string,
  policyViolation: LeaderPolicyViolation | null = null,
): TodoReminderTurnResolution {
  return finalizeTodoReminderTurn(agentId, { role }, reminder, response, policyViolation)
}

export function __getTodoReminderCooldownForTests(agentId: string): number | undefined {
  return todoReminderCooldowns.get(agentId)
}

export function __setAgentLockForTests(agentId: string, locked: boolean): void {
  if (locked) {
    agentLocks.set(agentId, Promise.resolve('[test-lock]'))
    return
  }
  agentLocks.delete(agentId)
}

export function __setTodoReminderEnqueueForTests(
  fn: ((agentId: string, content: string, kind: TodoReminderKind) => void) | null,
): void {
  enqueueTodoReminder = fn
    ? (agentId, payload) => fn(agentId, payload.content, payload.kind)
    : defaultTodoReminderEnqueue
}

export function __runTodoReminderCheckForTests(
  agentId: string,
  now: number,
  requireUnlocked = false,
): boolean {
  return queueTodoReminderIfNeeded(agentId, { now, requireUnlocked })
}

export function __resetTodoReminderStateForTests(): void {
  todoReminderCooldowns.clear()
  agentLocks.clear()
  enqueueTodoReminder = defaultTodoReminderEnqueue
}
