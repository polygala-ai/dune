import { Hono } from 'hono'
import { join, dirname } from 'node:path'
import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, existsSync, unlinkSync, type Dirent } from 'node:fs'
import * as agentStore from '../storage/agent-store.js'
import { config } from '../config.js'

export const agentsMemoryApi = new Hono()

function getMemoryDir(agentId: string): string {
  return join(config.agentsRoot, agentId, '.dune', 'memory')
}

function safeRelativePath(filePath: string): string | null {
  // Prevent path traversal — must be a relative path without ..
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.includes('..') || normalized.includes('\0')) return null
  return normalized
}

// List all memory files
agentsMemoryApi.get('/:id/memory', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)

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
        try {
          stat = statSync(fullPath)
        } catch {
          continue
        }
        if (!stat.isFile()) continue
        files.push({ path: rel, size: stat.size, modifiedAt: stat.mtimeMs })
      }
    }
  }
  walk(memDir, '')
  files.sort((a, b) => a.path.localeCompare(b.path))
  return c.json(files)
})

// Read a single memory file
agentsMemoryApi.get('/:id/memory/file', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const filePath = safeRelativePath(c.req.query('path') || '')
  if (!filePath) return c.json({ error: 'Invalid path' }, 400)

  const fullPath = join(getMemoryDir(agent.id), filePath)

  try {
    const content = readFileSync(fullPath, 'utf-8')
    return c.json({ content })
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})

// Create a new memory file
agentsMemoryApi.post('/:id/memory/file', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const filePath = safeRelativePath(c.req.query('path') || '')
  if (!filePath) return c.json({ error: 'Invalid path' }, 400)

  const fullPath = join(getMemoryDir(agent.id), filePath)

  if (existsSync(fullPath)) return c.json({ error: 'File already exists' }, 409)

  const body = await c.req.json()
  const content = typeof body.content === 'string' ? body.content : ''
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  return c.json({ ok: true }, 201)
})

// Update a memory file
agentsMemoryApi.put('/:id/memory/file', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const filePath = safeRelativePath(c.req.query('path') || '')
  if (!filePath) return c.json({ error: 'Invalid path' }, 400)

  const fullPath = join(getMemoryDir(agent.id), filePath)

  const body = await c.req.json()
  const content = typeof body.content === 'string' ? body.content : ''
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  return c.json({ ok: true })
})

// Delete a memory file
agentsMemoryApi.delete('/:id/memory/file', async (c) => {
  const agent = agentStore.getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const filePath = safeRelativePath(c.req.query('path') || '')
  if (!filePath) return c.json({ error: 'Invalid path' }, 400)

  const fullPath = join(getMemoryDir(agent.id), filePath)

  try {
    unlinkSync(fullPath)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})
