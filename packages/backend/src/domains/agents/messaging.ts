import * as agentStore from '../../storage/agent-store.js'
import * as agentRuntimeStore from '../../storage/agent-runtime-store.js'
import { randomUUID } from 'node:crypto'
import { newEventId } from '../../utils/ids.js'
import { retriedExec, streamingExec } from './container-exec.js'
import {
  SKILLBOX_PATH,
  MCP_CONFIG_PATH,
  SYSTEM_PROMPT_DIR,
  RPC_GUEST_PATH,
  STOP_AGENT_SHUTDOWN_PROMPT,
} from './constants.js'
import type {
  RunningAgent,
  BuildClaudeCliCommandInput,
  InputMetadata,
  LeaderToolUse,
} from './constants.js'
import type { AgentLogEntry } from '@dune/shared'
import { runningAgents, agentLocks, setAgentStatus, emitAgentLogEntries, emitRuntimeLog } from './runtime-state.js'
import { buildSystemPrompt, resolveClaudeModelId } from './prompt-builder.js'
import { buildClaudeCliAuthEnvValues } from './settings-sync.js'
import { detectLeaderPolicyViolation, finalizeTodoReminderTurn, queueTodoReminderIfNeeded } from './todo-reminder.js'

// ── Stream parsing ──────────────────────────────────────────────────────

/** Parse a single stream-json line from Claude CLI into log entries. */
export function parseStreamJsonLine(parsed: any, agentId: string): AgentLogEntry[] {
  const entries: AgentLogEntry[] = []

  if (parsed.type === 'assistant') {
    const content = parsed.message?.content || []
    for (const block of content) {
      if (block.type === 'text') {
        entries.push({ id: newEventId(), agentId, timestamp: Date.now(),
          type: 'text', data: { text: block.text } })
      } else if (block.type === 'tool_use') {
        entries.push({ id: newEventId(), agentId, timestamp: Date.now(),
          type: 'tool_use', data: { toolName: block.name, toolId: block.id, input: block.input } })
      } else if (block.type === 'tool_result') {
        entries.push({ id: newEventId(), agentId, timestamp: Date.now(),
          type: 'tool_result', data: {
            toolId: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            isError: !!block.is_error,
          } })
      }
    }
  } else if (parsed.type === 'user') {
    const content = parsed.message?.content || []
    for (const block of content) {
      if (block.type === 'tool_result') {
        const blockContent = block.content
        const contentStr = typeof blockContent === 'string' ? blockContent
          : Array.isArray(blockContent) ? blockContent.map((c: any) => typeof c === 'string' ? c : c.text || JSON.stringify(c)).join('')
          : JSON.stringify(blockContent)
        entries.push({ id: newEventId(), agentId, timestamp: Date.now(),
          type: 'tool_result', data: {
            toolId: block.tool_use_id || '',
            content: contentStr?.slice(0, 5000) || '',
            isError: !!block.is_error,
          } })
      }
    }
  } else if (parsed.type === 'result') {
    entries.push({ id: newEventId(), agentId, timestamp: Date.now(),
      type: 'result', data: {
        durationMs: parsed.duration_ms,
        numTurns: parsed.num_turns,
        totalCostUsd: parsed.total_cost_usd,
      } })
  }

  return entries
}

// ── CLI command building ────────────────────────────────────────────────

export function buildClaudeCliCommand(input: BuildClaudeCliCommandInput): string {
  const oauthToken = input.oauthToken.trim()
  const modelId = input.modelId?.trim() || ''
  const isPlanMode = input.permissionMode === 'plan'
  return [
    `cat ${input.promptFile} |`,
    `runuser -u abc -- env`,
    `HOME=/config`,
    `PATH=${SKILLBOX_PATH}`,
    `DISPLAY=:1`,
    `SHELL=/bin/bash`,
    `IS_SANDBOX=1`,
    `AGENT_ID=${input.agentId}`,
    `DUNE_AGENT_ID=${input.agentId}`,
    ...(input.wsUrl ? [`DUNE_WS_URL=${input.wsUrl}`] : []),
    `DUNE_RPC_SCRIPT=${RPC_GUEST_PATH}`,
    ...(oauthToken ? [`CLAUDE_CODE_OAUTH_TOKEN=${oauthToken}`] : []),
    `claude --print`,
    ...(modelId ? [`--model ${modelId}`] : []),
    `--dangerously-skip-permissions`,
    ...(isPlanMode ? ['--permission-mode plan'] : ['--permission-mode default']),
    `--output-format stream-json`,
    `--verbose`,
    `--mcp-config ${MCP_CONFIG_PATH}`,
    `--append-system-prompt-file ${input.systemPromptFile}`,
    `--max-turns 30`,
    ...(input.sessionId ? [`--session-id ${input.sessionId}`] : []),
    ...(input.resumeSessionId ? [`--resume ${input.resumeSessionId}`] : []),
    ...(!input.sessionId && !input.resumeSessionId && input.hasSession ? ['--continue'] : []),
  ].join(' ')
}

export function __buildClaudeCliCommandForTests(input: BuildClaudeCliCommandInput): string {
  return buildClaudeCliCommand(input)
}

export function __getStopAgentShutdownPromptForTests(): string {
  return STOP_AGENT_SHUTDOWN_PROMPT
}

// ── Interrupt helpers ───────────────────────────────────────────────────

export function triggerInterruptSignals(agentId: string, running: RunningAgent): void {
  if (running.currentExecution) {
    running.currentExecution.kill().then(() => {
      console.log(`[${agentId}] execution.kill() succeeded`)
    }).catch((err: any) => {
      console.warn(`[${agentId}] execution.kill() failed: ${err?.message || err}`)
    })
  } else {
    console.warn(`[${agentId}] interrupt: no currentExecution to kill`)
  }

  const interruptPattern = `/tmp/system-prompt-${agentId}.txt`
  const interruptScript = [
    `self="$$"`,
    `targets="$(ps -eo pid=,args= | awk -v self="$self" 'index($0, "${interruptPattern}") && $1 != self { print $1 }')"`,
    `if [ -n "$targets" ]; then`,
    `  kill -KILL $targets 2>/dev/null || true`,
    `fi`,
  ].join('; ')
  // Run interrupt script inside the sandbox container
  void running.box.exec('bash', ['-lc', interruptScript], { DISPLAY: ':1' }).catch((err: any) => {
    console.warn(`[${agentId}] Failed to interrupt current workflow via process kill fallback: ${err?.message || err}`)
  })

  // Resolve the abort signal so streamingExec unblocks immediately
  if (running.interruptAbort) {
    running.interruptAbort.resolve()
    running.interruptAbort = null
  }
}

export function finalizeInterruptedRun(agentId: string, running: RunningAgent, metadata: Record<string, unknown> = {}, sessionId?: string): string {
  running.hasSession = true
  if (sessionId) {
    running.sessionId = sessionId
    agentRuntimeStore.setAgentRuntimeSessionId(agentId, sessionId)
  } else {
    agentRuntimeStore.setAgentRuntimeHasSession(agentId, true)
  }
  running.thinkingSince = 0
  emitRuntimeLog(agentId, 'lifecycle', 'claude_cli_interrupted', metadata)
  emitAgentLogEntries(agentId, [{
    id: newEventId(),
    agentId,
    timestamp: Date.now(),
    type: 'system',
    data: {
      message: 'Workflow interrupted.',
    },
  }])
  setAgentStatus(agentId, 'idle', { source: 'interrupt-agent', reason: 'workflow interrupted' })
  return '[INTERRUPTED]'
}

// ── sendMessage ─────────────────────────────────────────────────────────

export async function sendMessage(agentId: string, messages: Array<{ authorName: string; content: string }>, metadata?: InputMetadata): Promise<string> {
  const running = runningAgents.get(agentId)
  if (!running) throw new Error(`Agent ${agentId} is not running`)

  // Wait for any in-flight sendMessage to finish before starting a new one
  const existing = agentLocks.get(agentId)
  if (existing) {
    try { await existing } catch { /* ignore — we'll run our own call */ }
  }

  const promise = _sendMessageInner(agentId, running, messages, metadata)
  agentLocks.set(agentId, promise)
  try {
    return await promise
  } finally {
    if (agentLocks.get(agentId) === promise) agentLocks.delete(agentId)
  }
}

export async function _sendMessageInner(
  agentId: string,
  running: RunningAgent,
  messages: Array<{ authorName: string; content: string }>,
  metadata?: InputMetadata,
): Promise<string> {
  running.interruptRequested = false
  let abortResolve: () => void
  const abortPromise = new Promise<void>((resolve) => { abortResolve = resolve })
  running.interruptAbort = { promise: abortPromise, resolve: abortResolve! }
  setAgentStatus(agentId, 'thinking', { source: 'send-message' })
  running.thinkingSince = Date.now()

  // Set busy flag so mailbox daemon skips polling during CLI invocation
  await retriedExec(running.box, 'touch', ['/tmp/agent-busy'], { DISPLAY: ':1' }, 10_000).catch(() => {})

  try {
    const conversationPrompt = messages.map(m => `${m.authorName}: ${m.content}`).join('\n')
    const fullPrompt = conversationPrompt

    // Log input with type-specific entry for rich frontend rendering
    const inputLogEntry = metadata?.source === 'dm'
      ? {
          id: newEventId(),
          agentId,
          timestamp: Date.now(),
          type: 'user_message' as const,
          data: {
            content: metadata.content || fullPrompt,
            clientRequestId: metadata.clientRequestId || null,
          },
        }
      : metadata?.source === 'mailbox'
        ? {
            id: newEventId(),
            agentId,
            timestamp: Date.now(),
            type: 'mailbox_notice' as const,
            data: {
              unreadCount: metadata.mailbox?.unreadCount ?? 0,
              batchId: metadata.mailbox?.batchId || null,
              expiresAt: metadata.mailbox?.expiresAt || null,
            },
          }
      : metadata?.source === 'channel'
        ? {
            id: newEventId(),
            agentId,
            timestamp: Date.now(),
            type: 'channel_input' as const,
            data: { channels: metadata.channels || [] },
          }
        : metadata?.source === 'app_action'
          ? {
              id: newEventId(),
              agentId,
              timestamp: Date.now(),
              type: 'system' as const,
              data: {
                message: `Miniapp action: ${metadata.appAction?.slug || 'unknown'} :: ${metadata.appAction?.action || 'unknown'}`,
              },
            }
        : {
            id: newEventId(),
            agentId,
            timestamp: Date.now(),
            type: 'system' as const,
            data: { message: `Received: "${fullPrompt.length > 200 ? fullPrompt.slice(0, 200) + '...' : fullPrompt}"` },
          }
    emitAgentLogEntries(agentId, [inputLogEntry])

    const thinkingEntry = { id: newEventId(), agentId, timestamp: Date.now(), type: 'thinking' as const, data: {} }
    emitAgentLogEntries(agentId, [thinkingEntry])

    // Write user prompt and system prompt to temp files
    const promptFile = `/tmp/prompt-${agentId}.txt`
    const systemPromptFile = `${SYSTEM_PROMPT_DIR}/system-prompt-${agentId}.txt`
    const currentAgent = agentStore.getAgent(agentId) || running.agent
    const systemPrompt = buildSystemPrompt(currentAgent)

    await Promise.all([
      retriedExec(running.box, 'python3', [
        '-c', 'import sys; open(sys.argv[1],"w").write(sys.argv[2])',
        promptFile, fullPrompt,
      ], { DISPLAY: ':1' }),
      retriedExec(running.box, 'python3', [
        '-c', 'import sys; open(sys.argv[1],"w").write(sys.argv[2])',
        systemPromptFile, systemPrompt,
      ], { DISPLAY: ':1' }),
    ])

    const oauthToken = buildClaudeCliAuthEnvValues().CLAUDE_CODE_OAUTH_TOKEN || ''
    const modelId = resolveClaudeModelId(currentAgent)
    const usePlanMode = currentAgent.workMode === 'plan-first' && !running.hasSession
    const turnSessionId = running.sessionId || randomUUID()
    const cliCmd = buildClaudeCliCommand({
      agentId,
      promptFile,
      systemPromptFile,
      hasSession: running.hasSession,
      oauthToken,
      modelId,
      wsUrl: running.backendUrl,
      ...(usePlanMode ? { permissionMode: 'plan' as const } : {}),
      ...(running.sessionId ? { resumeSessionId: running.sessionId } : { sessionId: turnSessionId }),
    })

    console.log(`[${agentId}] Starting claude -p (prompt length: ${fullPrompt.length})...`)
    emitRuntimeLog(agentId, 'lifecycle', 'claude_cli_start', {
      promptLength: fullPrompt.length,
      hasSession: running.hasSession,
    })

    let fullResponse = ''
    let firstOutputSent = false
    const leaderToolUses: LeaderToolUse[] = []
    const result = await streamingExec(
      running.box, 'bash', ['-c', cliCmd], { DISPLAY: ':1' },
      (line) => {
        try {
          const parsed = JSON.parse(line)
          const entries = parseStreamJsonLine(parsed, agentId)
          if (entries.length > 0) {
            emitAgentLogEntries(agentId, entries)
            if (currentAgent.role === 'leader') {
              for (const entry of entries) {
                if (entry.type !== 'tool_use') continue
                leaderToolUses.push({
                  toolName: String(entry.data.toolName || ''),
                  input: entry.data.input,
                })
              }
            }
            if (!firstOutputSent) {
              firstOutputSent = true
              setAgentStatus(agentId, 'responding', { source: 'send-message', reason: 'first streamed output' })
            }
          }
          if (parsed.type === 'result') {
            fullResponse = parsed.result || ''
          }
        } catch {
          console.warn(`[${agentId}] non-JSON stdout line: ${line.slice(0, 200)}`)
          emitRuntimeLog(agentId, 'stdout', line, { source: 'claude-stream', parse: 'non-json' })
        }
      },
      300_000,
      (cb) => {
        running.currentExecution = cb
        if (cb && running.interruptRequested) {
          triggerInterruptSignals(agentId, running)
        }
      },
      running.interruptAbort?.promise,
    )

    if (running.interruptRequested || result.aborted) {
      return finalizeInterruptedRun(agentId, running, {
        exitCode: result.exitCode,
        stdoutBytes: result.stdout.length,
        stderrBytes: result.stderr.length,
      }, turnSessionId)
    }

    console.log(`[${agentId}] streamingExec done: exit=${result.exitCode} stdout=${result.stdout.length}b stderr=${result.stderr.length}b firstOutput=${firstOutputSent} response=${fullResponse.length}b`)
    emitRuntimeLog(agentId, 'lifecycle', 'claude_cli_complete', {
      exitCode: result.exitCode,
      stdoutBytes: result.stdout.length,
      stderrBytes: result.stderr.length,
      firstOutputSent,
      responseBytes: fullResponse.length,
    })

    if (result.stderr) {
      console.error(`Agent ${agentId} stderr:`, result.stderr)
      const stderrLines = result.stderr.replace(/\r\n/g, '\n').split('\n').filter((line) => line.length > 0)
      for (const stderrLine of stderrLines) {
        emitRuntimeLog(agentId, 'stderr', stderrLine, { source: 'claude-stream' })
      }
    }

    running.hasSession = true
    running.sessionId = turnSessionId
    agentRuntimeStore.setAgentRuntimeSessionId(agentId, turnSessionId)

    // Plan-first phase 2
    if (usePlanMode && fullResponse) {
      console.log(`[${agentId}] Plan phase complete, starting execution phase...`)
      emitAgentLogEntries(agentId, [{
        id: newEventId(),
        agentId,
        timestamp: Date.now(),
        type: 'system' as const,
        data: { message: 'Plan complete. Executing...' },
      }])

      const executePrompt = 'The plan looks good. Now execute it.'
      await retriedExec(running.box, 'python3', [
        '-c', 'import sys; open(sys.argv[1],"w").write(sys.argv[2])',
        promptFile, executePrompt,
      ], { DISPLAY: ':1' })

      const execCmd = buildClaudeCliCommand({
        agentId,
        promptFile,
        systemPromptFile,
        hasSession: true,
        oauthToken,
        modelId,
        agentHttpUrl: running.agentHttpUrl,
        wsUrl: running.backendUrl,
        resumeSessionId: turnSessionId,
      })

      console.log(`[${agentId}] Starting execution phase...`)
      let execResponse = ''
      const execResult = await streamingExec(
        running.box, 'bash', ['-c', execCmd], { DISPLAY: ':1' },
        (line) => {
          try {
            const parsed = JSON.parse(line)
            const entries = parseStreamJsonLine(parsed, agentId)
            if (entries.length > 0) emitAgentLogEntries(agentId, entries)
            if (parsed.type === 'result') execResponse = parsed.result || ''
          } catch {
            emitRuntimeLog(agentId, 'stdout', line, { source: 'claude-stream-exec', parse: 'non-json' })
          }
        },
        300_000,
        (cb) => {
          running.currentExecution = cb
          if (cb && running.interruptRequested) {
            triggerInterruptSignals(agentId, running)
          }
        },
        running.interruptAbort?.promise,
      )

      if (execResult.stderr) {
        console.error(`Agent ${agentId} exec phase stderr:`, execResult.stderr)
      }

      console.log(`[${agentId}] Execution phase done: exit=${execResult.exitCode} response=${execResponse.length}b`)
      fullResponse = execResponse || fullResponse
    }

    running.thinkingSince = 0
    setAgentStatus(agentId, 'idle', { source: 'send-message' })

    const leaderPolicyViolation = currentAgent.role === 'leader'
      ? detectLeaderPolicyViolation(leaderToolUses)
      : null
    if (leaderPolicyViolation) {
      emitAgentLogEntries(agentId, [{
        id: newEventId(),
        agentId,
        timestamp: Date.now(),
        type: 'system',
        data: {
          message: `Leader policy violation: ${leaderPolicyViolation.reason}`,
          toolName: leaderPolicyViolation.toolName,
        },
      }])
      emitRuntimeLog(agentId, 'lifecycle', 'leader_policy_violation', leaderPolicyViolation)
    }

    const reminderTurn = finalizeTodoReminderTurn(
      agentId,
      currentAgent,
      metadata?.todoReminder,
      fullResponse,
      leaderPolicyViolation,
    )

    if (reminderTurn.allowImmediateRequeue) {
      queueTodoReminderIfNeeded(agentId)
    }

    return fullResponse || '[NO_RESPONSE]'
  } catch (err: any) {
    if (running.interruptRequested) {
      return finalizeInterruptedRun(agentId, running, {
        error: err?.message?.slice(0, 200) || 'unknown interrupt error',
      }, turnSessionId)
    }
    console.error(`[${agentId}] sendMessage error:`, err.message?.slice(0, 200))
    running.thinkingSince = 0
    const errorMessage = err.message?.slice(0, 200) || 'unknown sendMessage error'
    emitRuntimeLog(agentId, 'lifecycle', 'claude_cli_failed', { error: errorMessage })
    setAgentStatus(agentId, 'error', { source: 'send-message', reason: errorMessage })
    setTimeout(() => {
      if (runningAgents.has(agentId) && agentStore.getAgent(agentId)?.status === 'error') {
        setAgentStatus(agentId, 'idle', { source: 'send-message', reason: 'auto-recover from transient error' })
        console.log(`[${agentId}] Auto-recovered from error → idle`)
      }
    }, 30_000)
    throw err
  } finally {
    running.currentExecution = null
    running.interruptRequested = false
    running.interruptAbort = null
    await retriedExec(running.box, 'rm', ['-f', '/tmp/agent-busy'], { DISPLAY: ':1' }, 10_000).catch(() => {})
  }
}
