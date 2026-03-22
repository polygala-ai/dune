import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DATA_DIR = join(tmpdir(), 'dune-messaging-detection')

const {
  __isLoginRequiredForTests: isLoginRequired,
  __isUnknownSessionErrorForTests: isUnknownSessionError,
  __isMaxTurnsReachedForTests: isMaxTurnsReached,
  __buildClaudeCliCommandForTests: buildClaudeCliCommand,
} = await import('../src/domains/agents/messaging.js')

// ── isLoginRequired ──────────────────────────────────────────────────

test('isLoginRequired detects "not logged in"', () => {
  assert.ok(isLoginRequired('Error: not logged in'))
})

test('isLoginRequired detects "please log in"', () => {
  assert.ok(isLoginRequired('Please log in to continue'))
})

test('isLoginRequired detects "login required"', () => {
  assert.ok(isLoginRequired('login required'))
})

test('isLoginRequired detects "unauthorized"', () => {
  assert.ok(isLoginRequired('401 Unauthorized'))
})

test('isLoginRequired detects "authentication required"', () => {
  assert.ok(isLoginRequired('authentication required'))
})

test('isLoginRequired returns false for normal output', () => {
  assert.equal(isLoginRequired('Agent completed successfully'), false)
  assert.equal(isLoginRequired(''), false)
  assert.equal(isLoginRequired('login page rendered'), false)
})

// ── isUnknownSessionError ────────────────────────────────────────────

test('isUnknownSessionError detects "no conversation found"', () => {
  assert.ok(isUnknownSessionError('no conversation found with session id abc-123'))
})

test('isUnknownSessionError detects "unknown session"', () => {
  assert.ok(isUnknownSessionError('Error: unknown session'))
})

test('isUnknownSessionError detects "session not found"', () => {
  assert.ok(isUnknownSessionError('session abc-123 not found'))
})

test('isUnknownSessionError returns false for normal output', () => {
  assert.equal(isUnknownSessionError('session started'), false)
  assert.equal(isUnknownSessionError(''), false)
})

// ── isMaxTurnsReached ────────────────────────────────────────────────

test('isMaxTurnsReached detects error_max_turns subtype', () => {
  assert.ok(isMaxTurnsReached({ subtype: 'error_max_turns' }))
})

test('isMaxTurnsReached detects max_turns stop_reason', () => {
  assert.ok(isMaxTurnsReached({ stop_reason: 'max_turns' }))
})

test('isMaxTurnsReached detects "max turns" in result text', () => {
  assert.ok(isMaxTurnsReached({ result: 'Stopped: reached max turns' }))
  assert.ok(isMaxTurnsReached({ result: 'Maximum turns exceeded' }))
})

test('isMaxTurnsReached returns false for normal result', () => {
  assert.equal(isMaxTurnsReached({ result: 'Done', stop_reason: 'end_turn' }), false)
  assert.equal(isMaxTurnsReached(null), false)
  assert.equal(isMaxTurnsReached({}), false)
})

// ── buildClaudeCliCommand with configurable flags ────────────────────

const baseInput = {
  agentId: 'test-agent',
  promptFile: '/tmp/prompt.txt',
  systemPromptFile: '/tmp/system.txt',
  hasSession: false,
  oauthToken: 'test-token',
  modelId: null,
  wsUrl: 'ws://localhost:3100',
  sessionId: 'test-session',
}

test('buildClaudeCliCommand defaults max-turns to 30', () => {
  const cmd = buildClaudeCliCommand(baseInput)
  assert.ok(cmd.includes('--max-turns 30'))
})

test('buildClaudeCliCommand uses custom maxTurns', () => {
  const cmd = buildClaudeCliCommand({ ...baseInput, maxTurns: 50 })
  assert.ok(cmd.includes('--max-turns 50'))
  assert.equal(cmd.includes('--max-turns 30'), false)
})

test('buildClaudeCliCommand includes effort when set', () => {
  const cmd = buildClaudeCliCommand({ ...baseInput, effort: 'high' })
  assert.ok(cmd.includes('--effort high'))
})

test('buildClaudeCliCommand omits effort when not set', () => {
  const cmd = buildClaudeCliCommand(baseInput)
  assert.equal(cmd.includes('--effort'), false)
})

test('buildClaudeCliCommand includes extra CLI args', () => {
  const cmd = buildClaudeCliCommand({ ...baseInput, extraCliArgs: ['--add-dir', '/tmp/skills'] })
  assert.ok(cmd.includes('--add-dir /tmp/skills'))
})

test('buildClaudeCliCommand includes nesting guard stripping', () => {
  const cmd = buildClaudeCliCommand(baseInput)
  assert.ok(cmd.includes('-u CLAUDECODE'))
  assert.ok(cmd.includes('-u CLAUDE_CODE_ENTRYPOINT'))
  assert.ok(cmd.includes('-u CLAUDE_CODE_SESSION'))
  assert.ok(cmd.includes('-u CLAUDE_CODE_PARENT_SESSION'))
})
