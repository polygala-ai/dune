import * as agentStore from '../../storage/agent-store.js'
import { dirname, join } from 'node:path'
import { readFileSync, mkdirSync, readdirSync, existsSync, statSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  AGENT_SKILLS_SOURCE_DIR,
  AGENT_SKILLS,
  AGENT_SKILL_FINGERPRINT_FILE,
} from './constants.js'
import { getAgentSkillsHostPath } from './host-paths.js'
import { getBuiltinAgentSkillNames } from './prompt-builder.js'

export function collectFilesRecursive(rootDir: string, prefix = ''): string[] {
  const dirPath = prefix ? join(rootDir, prefix) : rootDir
  const files: string[] = []
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(rootDir, relPath))
    } else if (entry.isFile()) {
      files.push(relPath)
    }
  }
  return files
}

export function fingerprintDirectory(rootDir: string): string {
  const hash = createHash('sha256')
  const files = collectFilesRecursive(rootDir).sort()
  for (const relPath of files) {
    const absolutePath = join(rootDir, relPath)
    hash.update(relPath)
    hash.update('\0')
    hash.update(readFileSync(absolutePath))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function syncSkillDirectory(sourceDir: string, targetDir: string): boolean {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`Missing bundled skill source directory: ${sourceDir}`)
  }

  const sourceFingerprint = fingerprintDirectory(sourceDir)
  const markerPath = join(targetDir, AGENT_SKILL_FINGERPRINT_FILE)
  const currentFingerprint = existsSync(markerPath)
    ? readFileSync(markerPath, 'utf-8').trim()
    : ''

  if (existsSync(targetDir) && currentFingerprint === sourceFingerprint) {
    return false
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(dirname(targetDir), { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true })
  writeFileSync(markerPath, `${sourceFingerprint}\n`, 'utf-8')
  return true
}

export function syncAgentSkills(agentId: string): void {
  const hostSkillsRoot = getAgentSkillsHostPath(agentId)
  mkdirSync(hostSkillsRoot, { recursive: true })

  const agent = agentStore.getAgent(agentId)
  const enabledSkills = getBuiltinAgentSkillNames(agent)

  for (const skillName of enabledSkills) {
    const sourceDir = join(AGENT_SKILLS_SOURCE_DIR, skillName)
    const targetDir = join(hostSkillsRoot, skillName)
    const changed = syncSkillDirectory(sourceDir, targetDir)
    console.log(`${changed ? 'Synced' : 'Verified'} agent skill "${skillName}" for agent ${agentId}`)
  }

  for (const skillName of AGENT_SKILLS) {
    if (enabledSkills.includes(skillName)) continue
    rmSync(join(hostSkillsRoot, skillName), { recursive: true, force: true })
  }
}
