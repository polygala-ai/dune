import { dirname, join } from 'node:path'
import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, existsSync, unlinkSync, type Dirent } from 'node:fs'
import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import { getMemoryDir, safeRelativePath } from './validation.js'

export function registerMemoryHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.listMemory', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    const memDir = getMemoryDir(agent.id)
    mkdirSync(memDir, { recursive: true })
    const files: Array<{ path: string; size: number; modifiedAt: number }> = []
    function walk(dir: string, prefix: string) {
      let entries: Dirent[]
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), rel)
        } else if (entry.name.endsWith('.md')) {
          const fullPath = join(dir, entry.name)
          let stat
          try { stat = statSync(fullPath) } catch { continue }
          if (!stat.isFile()) continue
          files.push({ path: rel, size: stat.size, modifiedAt: stat.mtimeMs })
        }
      }
    }
    walk(memDir, '')
    files.sort((a, b) => a.path.localeCompare(b.path))
    return files
  })

  h('agents.readMemory', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    const filePath = safeRelativePath(params.path as string || '')
    if (!filePath) throw new Error('Invalid path')
    const fullPath = join(getMemoryDir(agent.id), filePath)
    try {
      return { content: readFileSync(fullPath, 'utf-8') }
    } catch {
      throw new Error('not_found')
    }
  })

  h('agents.writeMemory', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    const filePath = safeRelativePath(params.path as string || '')
    if (!filePath) throw new Error('Invalid path')
    const fullPath = join(getMemoryDir(agent.id), filePath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, typeof params.content === 'string' ? params.content : '', 'utf-8')
    return { ok: true }
  })

  h('agents.createMemory', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    const filePath = safeRelativePath(params.path as string || '')
    if (!filePath) throw new Error('Invalid path')
    const fullPath = join(getMemoryDir(agent.id), filePath)
    if (existsSync(fullPath)) throw new Error('file_exists')
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, typeof params.content === 'string' ? params.content : '', 'utf-8')
    return { ok: true }
  })

  h('agents.deleteMemory', async (params) => {
    const agent = agentStore.getAgent(params.agentId as string)
    if (!agent) throw new Error('not_found')
    const filePath = safeRelativePath(params.path as string || '')
    if (!filePath) throw new Error('Invalid path')
    try {
      unlinkSync(join(getMemoryDir(agent.id), filePath))
      return { ok: true }
    } catch {
      throw new Error('not_found')
    }
  })
}
