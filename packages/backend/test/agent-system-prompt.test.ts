import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DATA_DIR = join(tmpdir(), 'dune-agent-system-prompt')

const { getDb } = await import('../src/storage/database.js')
const agentStore = await import('../src/storage/agent-store.js')
await import('../src/domains/agents/_init.js')
const { __getStopAgentShutdownPromptForTests } = await import('../src/domains/agents/messaging.js')
const { __resolveBundledAssetDirForTests } = await import('../src/domains/agents/constants.js')
const { assembleSystemPrompt, listSkills, renderTemplate } = await import('../src/domains/agents/prompt-builder.js')

const db = getDb()

function clearTables() {
  db.exec(`
    DELETE FROM subscriptions;
    DELETE FROM agent_read_cursors;
    DELETE FROM agent_runtime_state;
    DELETE FROM agents;
  `)
}

test('assembled system prompt does not include AGENTS profile sections', () => {
  clearTables()

  const agent = agentStore.createAgent({
    name: 'Prompt Test Agent',
    personality: 'Prompt test',
    role: 'leader',
  })

  const prompt = assembleSystemPrompt(agent.id)
  assert.ok(prompt.length > 0)
  assert.equal(prompt.includes('--- AGENTS.global.md ---'), false)
  assert.equal(prompt.includes('--- AGENTS.agent.md ---'), false)
  assert.equal(prompt.includes('/config/agents/'), false)
  assert.equal(prompt.includes('--- Skill:'), false)
  assert.equal(prompt.includes('<environment>'), false)
  assert.equal(prompt.includes('</environment>'), false)
  assert.equal(prompt.includes('<identity>'), true)
  assert.equal(prompt.includes('</identity>'), true)
  assert.match(prompt, /Identity rule: You are defined by memory\./)
  assert.match(prompt, /<agent>/)
  assert.match(prompt, /Role: leader/)
  assert.match(prompt, /Work mode: plan-first/)
  assert.match(prompt, /use dune-leader to reassess the mission/i)
  assert.match(prompt, /assign work, follow up, review outcomes/i)
  assert.match(prompt, /Do not implement directly yourself/i)
  assert.match(prompt, /Remove obstacles aggressively/i)
  assert.match(prompt, /do not wait passively/i)
  assert.match(prompt, /leader-thesis\.md/i)
  assert.match(prompt, /Leader PDCA footer/i)
  assert.match(prompt, /Before editing files, using tools, or taking multi-step action/i)
})

test('stop-agent shutdown prompt remains generic and not role-specific', () => {
  const prompt = __getStopAgentShutdownPromptForTests()
  assert.match(prompt, /Save any important information from this session/i)
  assert.equal(prompt.includes('leader'), false)
  assert.equal(prompt.includes('follower'), false)
})

test('listSkills includes markdown payload while preserving existing fields', () => {
  const skills = listSkills({ role: 'leader' })
  assert.ok(skills.length > 0)

  for (const skill of skills) {
    assert.equal(typeof skill.name, 'string')
    assert.equal(typeof skill.description, 'string')
    assert.equal(Array.isArray(skill.scripts), true)
    assert.equal(typeof skill.preview, 'string')
    assert.equal(typeof skill.markdown, 'string')
    assert.ok(skill.markdown.trim().length > 0)
    assert.equal(skill.preview, skill.description)
  }

  assert.ok(skills.some(skill => skill.name === 'dune-leader'))
  assert.equal(skills.some(skill => skill.name === 'dune-sandbox-operator'), false)
  // host-operator is a coordination skill shared by both leader and follower
  assert.equal(skills.some(skill => skill.name === 'dune-host-operator'), true)
  assert.equal(skills.some(skill => skill.name === 'dune-miniapp-builder'), false)
  assert.equal(listSkills({ role: 'follower' }).some(skill => skill.name === 'dune-leader'), false)
})

test('renderTemplate substitutes dotted paths', () => {
  const result = renderTemplate('Hello {{agent.name}}, role={{agent.role}}', {
    agent: { name: 'Alice', role: 'leader' },
  })
  assert.equal(result, 'Hello Alice, role=leader')
})

test('renderTemplate leaves unknown keys as empty string', () => {
  const result = renderTemplate('{{missing}} and {{deep.missing}}', {})
  assert.equal(result, ' and ')
})

test('renderTemplate handles top-level keys', () => {
  const result = renderTemplate('id={{agentId}}', { agentId: 'abc-123' })
  assert.equal(result, 'id=abc-123')
})

test('renderTemplate handles null/undefined values', () => {
  const result = renderTemplate('{{val}}', { val: null })
  assert.equal(result, '')
})

test('renderTemplate converts numbers to strings', () => {
  const result = renderTemplate('count={{count}}', { count: 42 })
  assert.equal(result, 'count=42')
})

test('bundled asset resolver falls back from dist to src assets', () => {
  const backendRoot = process.cwd()

  assert.equal(
    __resolveBundledAssetDirForTests('agents/skills', resolve(backendRoot, 'dist')),
    resolve(backendRoot, 'src', 'domains', 'agents', 'skills'),
  )
  assert.equal(
    __resolveBundledAssetDirForTests('agents/prompts', resolve(backendRoot, 'dist')),
    resolve(backendRoot, 'src', 'domains', 'agents', 'prompts'),
  )
  assert.equal(
    __resolveBundledAssetDirForTests('agent-mcp', resolve(backendRoot, 'dist')),
    resolve(backendRoot, 'src', 'domains', 'agents', 'mcp'),
  )
})
