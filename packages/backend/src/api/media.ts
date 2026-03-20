import { Hono } from 'hono'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

const MEDIA_DIR = join(config.dataRoot, 'media')
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

export const mediaApi = new Hono()

mediaApi.post('/', async (c) => {
  const formData = await c.req.parseBody()
  const file = formData['file']

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing "file" field in multipart form data' }, 400)
  }

  const ext = MIME_TO_EXT[file.type]
  if (!ext) {
    return c.json({ error: `Unsupported image type: ${file.type}. Allowed: ${Object.keys(MIME_TO_EXT).join(', ')}` }, 400)
  }

  if (file.size > MAX_SIZE) {
    return c.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB` }, 413)
  }

  const filename = `${randomUUID()}${ext}`
  const filePath = join(MEDIA_DIR, filename)

  mkdirSync(MEDIA_DIR, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  writeFileSync(filePath, buffer)

  return c.json({ url: `/media/${filename}` })
})
