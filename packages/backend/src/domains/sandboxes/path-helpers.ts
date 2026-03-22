import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { config as appConfig } from '../../config.js'

export function isWithin(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function ensureContainerPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed.startsWith('/')) throw new Error('path must be an absolute container path')
  if (trimmed.includes('\0')) throw new Error('path contains null byte')
  if (trimmed.split('/').some((part) => part === '..')) {
    throw new Error('path traversal is not allowed')
  }
  return trimmed
}

export function normalizeContainerPath(path: string): string {
  const normalized = ensureContainerPath(path)
  if (normalized === '/') return '/'
  return normalized.replace(/\/+$/, '')
}

export function ensureNonRootPath(path: string): string {
  const normalized = normalizeContainerPath(path)
  if (normalized === '/') throw new Error('invalid_path')
  return normalized
}

export function getContainerParentPath(path: string): string | null {
  const normalized = normalizeContainerPath(path)
  if (normalized === '/') return null
  const parent = dirname(normalized)
  return parent === '' ? '/' : parent
}

export function parseInteger(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.floor(parsed)
}

export function splitNonEmptyLines(text: string): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter(Boolean)
}

export function statusOrder(status: string): number {
  switch (status) {
    case 'running':
      return 0
    case 'creating':
      return 1
    case 'configured':
      return 2
    case 'stopping':
      return 3
    case 'stopped':
      return 4
    case 'unknown':
      return 5
    case 'error':
      return 6
    default:
      return 10
  }
}

export function ensureHostPath(path: string): string {
  const abs = resolve(path)
  if (!isAbsolute(abs)) {
    throw new Error('hostPath must be absolute')
  }
  const allowedRoots = [...new Set([appConfig.repoRoot, appConfig.dataRoot].map(root => resolve(root)))]
  if (!allowedRoots.some(root => isWithin(root, abs))) {
    throw new Error(`hostPath must be within ${allowedRoots.join(' or ')}`)
  }
  if (!existsSync(abs)) {
    throw new Error('hostPath does not exist')
  }
  return abs
}
