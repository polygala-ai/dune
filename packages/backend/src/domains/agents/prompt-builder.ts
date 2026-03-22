import * as agentStore from '../../storage/agent-store.js'
import { getStoredClaudeSettings } from '../../storage/claude-settings-store.js'
import { join } from 'node:path'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import type { Agent } from '@dune/shared'
import {
  AGENT_SKILLS_SOURCE_DIR,
  SYSTEM_PROMPT_TEMPLATE_PATH,
  TODO_HANDOFF_MEMORY_PATH,
  LEADER_THESIS_MEMORY_PATH,
  LEADER_AGENT_SKILLS,
  FOLLOWER_AGENT_SKILLS,
  AGENT_SKILLS,
} from './constants.js'
import type { SkillInfo, BuiltinSkillName } from './constants.js'

/** Parse YAML frontmatter from a SKILL.md file (simple key: value extraction). */
export function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { name: '', description: '' }
  const lines = match[1].split('\n')
  let name = ''
  let description = ''
  for (const line of lines) {
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (key.trim() === 'name') name = value
    if (key.trim() === 'description') description = value
  }
  return { name, description }
}

export function getBuiltinAgentSkillNames(agent?: Pick<Agent, 'role'> | null): BuiltinSkillName[] {
  if (!agent) return [...AGENT_SKILLS]
  return agent.role === 'leader'
    ? [...LEADER_AGENT_SKILLS]
    : [...FOLLOWER_AGENT_SKILLS]
}

/** List all skills with their metadata for an agent. */
export function listSkills(agent?: Pick<Agent, 'role'> | null): SkillInfo[] {
  const skills: SkillInfo[] = []
  for (const skillName of getBuiltinAgentSkillNames(agent)) {
    const skillDir = join(AGENT_SKILLS_SOURCE_DIR, skillName)
    if (!existsSync(skillDir)) continue

    const skillMdPath = join(skillDir, 'SKILL.md')
    let name: string = skillName
    let description = ''
    let preview = ''
    let markdown = ''
    if (existsSync(skillMdPath)) {
      const content = readFileSync(skillMdPath, 'utf-8')
      markdown = content
      const fm = parseSkillFrontmatter(content)
      if (fm.name) name = fm.name
      if (fm.description) description = fm.description
      preview = fm.description || ''
    }

    const scriptsDir = join(skillDir, 'scripts')
    let scripts: string[] = []
    if (existsSync(scriptsDir) && statSync(scriptsDir).isDirectory()) {
      scripts = readdirSync(scriptsDir).filter(f => f.endsWith('.sh')).sort()
    }

    skills.push({ name, description, preview, scripts, markdown })
  }
  return skills
}

/** Replace {{dotted.path}} placeholders with values from a data object. */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, dotPath: string) => {
    let cursor: unknown = data
    for (const part of dotPath.split('.')) {
      if (typeof cursor !== 'object' || cursor === null) return ''
      cursor = (cursor as Record<string, unknown>)[part]
    }
    if (cursor == null) return ''
    return typeof cursor === 'string' ? cursor : String(cursor)
  })
}

/** Assemble the full system prompt an agent receives (for viewing). */
export function assembleSystemPrompt(agentId: string): string {
  const agent = agentStore.getAgent(agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)
  return buildSystemPrompt(agent)
}

export function getSystemPromptTemplate(): string {
  const prompt = readFileSync(SYSTEM_PROMPT_TEMPLATE_PATH, 'utf-8').trim()
  if (!prompt) {
    throw new Error(`System prompt template is empty: ${SYSTEM_PROMPT_TEMPLATE_PATH}`)
  }
  return prompt
}

export function buildSystemPrompt(agent: Pick<Agent, 'name' | 'personality' | 'role' | 'workMode'>): string {
  const roleGuidance = agent.role === 'leader'
    ? `You are the leader. You assign work, follow up, review outcomes, and remain accountable for the result. Do not implement directly yourself. Remove obstacles aggressively and do not wait passively—exhaust obstacle-removal methods (re-scope, reassign, recruit, gather context, reroute, escalate sideways) before escalating to a human. When work goes idle or the mission is unclear, use dune-leader to reassess the mission, update ${LEADER_THESIS_MEMORY_PATH} only when the mission materially changes, run one delegation-and-review PDCA cycle, and end with the required Leader PDCA footer. Use nextPlan and ${TODO_HANDOFF_MEMORY_PATH} only as optional operational notes after the cycle.`
    : 'You are a follower. Preserve the original todo request, keep progress in working fields or memory, and do not rewrite the original request.'
  const workModeGuidance = agent.workMode === 'plan-first'
    ? 'Work mode: plan-first. Before editing files, using tools, or taking multi-step action, inspect the current state and form a concrete plan for yourself first. Then execute against that plan.'
    : 'Work mode: normal. Once you have enough context, act directly and avoid unnecessary planning overhead.'

  return [
    getSystemPromptTemplate(),
    '',
    '<agent>',
    `Name: ${agent.name}`,
    `Role: ${agent.role}`,
    `Work mode: ${agent.workMode}`,
    `Personality: ${agent.personality}`,
    roleGuidance,
    workModeGuidance,
    '</agent>',
  ].join('\n')
}

export function resolveClaudeModelId(agent: Pick<Agent, 'modelIdOverride'>): string | null {
  const override = agent.modelIdOverride?.trim()
  if (override) return override
  return getStoredClaudeSettings().defaultModelId
}
