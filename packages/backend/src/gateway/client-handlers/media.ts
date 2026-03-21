import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { Handler } from '../protocol.js'
import { config } from '../../config.js'

const MEDIA_DIR = join(config.dataRoot, 'media')
const MEDIA_MAX_SIZE = 10 * 1024 * 1024 // 10 MB decoded
const MEDIA_MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

export function registerMediaHandlers(h: (method: string, fn: Handler) => void): void {
  h('media.uploadImage', async (params) => {
    const mimeType = params.mimeType as string
    const contentBase64 = params.contentBase64 as string
    if (!mimeType || !contentBase64) throw new Error('mimeType and contentBase64 required')

    const ext = MEDIA_MIME_TO_EXT[mimeType]
    if (!ext) throw new Error(`Unsupported image type: ${mimeType}. Allowed: ${Object.keys(MEDIA_MIME_TO_EXT).join(', ')}`)

    const buffer = Buffer.from(contentBase64, 'base64')
    if (buffer.length > MEDIA_MAX_SIZE) throw new Error(`File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Max: 10MB`)

    const { randomUUID } = await import('node:crypto')
    const filename = `${randomUUID()}${ext}`
    mkdirSync(MEDIA_DIR, { recursive: true })
    writeFileSync(join(MEDIA_DIR, filename), buffer)
    return { url: `/media/${filename}` }
  })
}
