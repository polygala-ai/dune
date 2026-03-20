import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DATA_DIR = join(tmpdir(), 'dune-agent-claude-settings-merge')

const agentManager = await import('../src/agents/agent-manager.js')

test('merge keeps existing root keys and unrelated env keys', () => {
  const existing = JSON.stringify({
    theme: 'dark',
    toolPreferences: { compact: true },
    env: {
      KEEP_ME: 'yes',
      ANTHROPIC_AUTH_TOKEN: 'old-token',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '0',
    },
  })

  const mergedText = agentManager.__mergeClaudeSettingsContentForTests(existing, {
    ANTHROPIC_AUTH_TOKEN: 'new-token',
    ANTHROPIC_BASE_URL: 'https://right.codes/o2a',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  })
  const merged = JSON.parse(mergedText)

  assert.equal(merged.theme, 'dark')
  assert.deepEqual(merged.toolPreferences, { compact: true })
  assert.equal(merged.env.KEEP_ME, 'yes')
  assert.equal(merged.env.ANTHROPIC_AUTH_TOKEN, 'new-token')
  assert.equal(merged.env.ANTHROPIC_BASE_URL, 'https://right.codes/o2a')
  assert.equal(merged.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1')
})

test('merge creates valid settings when content is missing', () => {
  const mergedText = agentManager.__mergeClaudeSettingsContentForTests(null, {
    ANTHROPIC_AUTH_TOKEN: 'token-1',
    ANTHROPIC_BASE_URL: 'https://right.codes/o2a',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  })
  const merged = JSON.parse(mergedText)

  assert.equal(typeof merged, 'object')
  assert.equal(merged.env.ANTHROPIC_AUTH_TOKEN, 'token-1')
  assert.equal(merged.env.ANTHROPIC_BASE_URL, 'https://right.codes/o2a')
  assert.equal(merged.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1')
})

test('merge removes managed env keys when they are cleared', () => {
  const existing = JSON.stringify({
    theme: 'dark',
    env: {
      KEEP_ME: 'yes',
      ANTHROPIC_AUTH_TOKEN: 'old-token',
      ANTHROPIC_BASE_URL: 'https://old.example.com',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  })

  // Only ANTHROPIC_AUTH_TOKEN is still set; the other managed keys are cleared
  const mergedText = agentManager.__mergeClaudeSettingsContentForTests(existing, {
    ANTHROPIC_AUTH_TOKEN: 'new-token',
  })
  const merged = JSON.parse(mergedText)

  assert.equal(merged.theme, 'dark')
  assert.equal(merged.env.KEEP_ME, 'yes', 'unmanaged keys must survive')
  assert.equal(merged.env.ANTHROPIC_AUTH_TOKEN, 'new-token')
  assert.equal(merged.env.ANTHROPIC_BASE_URL, undefined, 'cleared base URL must be removed')
  assert.equal(merged.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined, 'cleared traffic flag must be removed')
})

test('merge falls back safely when existing content is malformed', () => {
  const mergedText = agentManager.__mergeClaudeSettingsContentForTests('{"env": {"KEEP_ME": "value"', {
    ANTHROPIC_AUTH_TOKEN: 'token-2',
  })
  const merged = JSON.parse(mergedText)

  assert.equal(merged.env.ANTHROPIC_AUTH_TOKEN, 'token-2')
  assert.equal(Object.keys(merged.env).length, 1)
})
