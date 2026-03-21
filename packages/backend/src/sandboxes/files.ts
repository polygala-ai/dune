import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { lookup as lookupMimeType } from 'mime-types'
import type {
  FileDownloadResponse,
  HostImportRequest,
  SandboxFsEntry,
  SandboxFsListResponse,
  SandboxFsMkdirRequest,
  SandboxFsMoveRequest,
  SandboxFsReadResponse,
} from '@dune/shared'
import * as sandboxStore from '../storage/sandbox-store.js'
import { withSandboxLock } from './runtime-state.js'
import { assertReadPermission, assertOperatePermission, ensureSandboxMutability, ensureBoxRunning } from './acl.js'
import { resolveBox } from './resource.js'
import { ensureRuntimeBox, execWithShellFallback } from './exec-helpers.js'
import {
  ensureContainerPath,
  normalizeContainerPath,
  ensureNonRootPath,
  getContainerParentPath,
  shQuote,
  ensureHostPath,
  parseInteger,
} from './path-helpers.js'
import type { ActorIdentity } from './types.js'

export async function uploadFileContent(
  identity: ActorIdentity,
  boxId: string,
  path: string,
  contentBase64: string,
  overwrite: boolean,
): Promise<void> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) throw new Error('not_found')
    ensureSandboxMutability(identity, box)
    assertOperatePermission(identity, boxId)
    ensureBoxRunning(identity, box)

    const runtimeEntry = await ensureRuntimeBox(identity, boxId, { locked: true })
    const containerPath = ensureContainerPath(path)
    const dirPath = ensureContainerPath(dirname(containerPath))
    const safeB64 = shQuote(contentBase64)
    const safePath = shQuote(containerPath)
    const safeDir = shQuote(dirPath)
    const checkOverwrite = overwrite ? '' : `if [ -e ${safePath} ]; then echo 'exists' >&2; exit 17; fi;`

    const cmd = `${checkOverwrite} mkdir -p ${safeDir} && printf '%s' ${safeB64} | base64 -d > ${safePath}`
    let result: { exitCode: number; stdout: string; stderr: string }
    try {
      result = await execWithShellFallback(runtimeEntry.box, cmd, {})
    } catch (err: any) {
      sandboxStore.recordFileOp({
        sandboxId: boxId,
        op: 'upload',
        path: containerPath,
        actorType: identity.actorType,
        actorId: identity.actorId,
        status: 'error',
        error: err?.message || 'upload_failed',
      })
      throw err
    }

    if (result.exitCode !== 0) {
      sandboxStore.recordFileOp({
        sandboxId: boxId,
        op: 'upload',
        path: containerPath,
        actorType: identity.actorType,
        actorId: identity.actorId,
        status: 'error',
        error: result.stderr || `exit ${result.exitCode}`,
      })
      if (!overwrite && result.exitCode === 17) throw new Error('file_exists')
      throw new Error(result.stderr || `Upload failed with exit ${result.exitCode}`)
    }

    sandboxStore.recordFileOp({
      sandboxId: boxId,
      op: 'upload',
      path: containerPath,
      actorType: identity.actorType,
      actorId: identity.actorId,
      status: 'ok',
      error: null,
    })
  })
}

export async function downloadFileContent(
  identity: ActorIdentity,
  boxId: string,
  path: string,
): Promise<FileDownloadResponse | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  ensureBoxRunning(identity, box)
  const runtimeEntry = await ensureRuntimeBox(identity, boxId)

  const containerPath = ensureContainerPath(path)
  const safePath = shQuote(containerPath)
  const result = await execWithShellFallback(runtimeEntry.box, `[ -f ${safePath} ] && base64 < ${safePath}`, {})
  if (result.exitCode !== 0) return null
  const contentBase64 = result.stdout.replace(/\s+/g, '')
  const size = contentBase64 ? Buffer.from(contentBase64, 'base64').length : 0
  return {
    path: containerPath,
    contentBase64,
    size,
  }
}

export async function listFsEntries(
  identity: ActorIdentity,
  boxId: string,
  path: string,
  options: { includeHidden?: boolean; limit?: number } = {},
): Promise<SandboxFsListResponse | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  const containerPath = normalizeContainerPath(path)
  ensureBoxRunning(identity, box)
  const runtimeEntry = await ensureRuntimeBox(identity, boxId)
  const includeHidden = !!options.includeHidden
  const limit = Number.isFinite(options.limit) && (options.limit || 0) > 0
    ? Math.min(5000, Math.floor(options.limit as number))
    : 1000

  const safePath = shQuote(containerPath)
  const listCmd = [
    `if [ ! -e ${safePath} ]; then exit 44; fi`,
    `if [ ! -d ${safePath} ]; then exit 45; fi`,
    'count=0',
    'truncated=0',
    `for entry in ${safePath}/* ${safePath}/.[!.]* ${safePath}/..?*; do`,
    '  [ -e "$entry" ] || continue',
    '  name="$(basename "$entry")"',
    `  if [ "${includeHidden ? '1' : '0'}" != "1" ] && [ "${'$'}{name#.}" != "${'$'}name" ]; then continue; fi`,
    '  type="other"',
    '  if [ -h "$entry" ]; then type="symlink"; elif [ -d "$entry" ]; then type="directory"; elif [ -f "$entry" ]; then type="file"; fi',
    '  size=""',
    '  if [ -f "$entry" ]; then size="$(wc -c < "$entry" 2>/dev/null || true)"; fi',
    '  modified="$(stat -c %Y "$entry" 2>/dev/null || stat -f %m "$entry" 2>/dev/null || true)"',
    '  printf \'%s\\t%s\\t%s\\t%s\\n\' "$name" "$type" "$size" "$modified"',
    `  count=$((${ '$' }count + 1))`,
    `  if [ "${'$'}count" -ge "${limit}" ]; then truncated=1; break; fi`,
    'done',
    'printf \'__TRUNCATED__\\t%s\\n\' "$truncated"',
  ].join('\n')

  const result = await execWithShellFallback(runtimeEntry.box, listCmd, {})
  if (result.exitCode === 44) throw new Error('path_not_found')
  if (result.exitCode === 45) throw new Error('not_directory')
  if (result.exitCode !== 0) throw new Error(result.stderr || `List failed with exit ${result.exitCode}`)

  const entries: SandboxFsEntry[] = []
  let truncated = false
  const lines = result.stdout.split(/\r?\n/g).filter((line) => line.trim().length > 0)
  for (const line of lines) {
    const parts = line.split('\t')
    if (parts[0] === '__TRUNCATED__') {
      truncated = parts[1] === '1'
      continue
    }
    const name = parts[0] || ''
    if (!name) continue
    const typeRaw = parts[1] || 'other'
    const type: SandboxFsEntry['type'] = (
      typeRaw === 'file' || typeRaw === 'directory' || typeRaw === 'symlink' || typeRaw === 'other'
        ? typeRaw
        : 'other'
    )
    const size = parseInteger(parts[2]) ?? null
    const modifiedAtSeconds = parseInteger(parts[3])
    const modifiedAt = modifiedAtSeconds == null ? null : modifiedAtSeconds * 1000
    const fullPath = containerPath === '/' ? `/${name}` : `${containerPath}/${name}`
    entries.push({
      path: fullPath,
      name,
      type,
      size,
      modifiedAt,
      hidden: name.startsWith('.'),
    })
  }

  entries.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name)
  })

  return {
    path: containerPath,
    parentPath: getContainerParentPath(containerPath),
    entries,
    truncated,
  }
}

export async function readFsFileContent(
  identity: ActorIdentity,
  boxId: string,
  path: string,
  maxBytes = 1024 * 1024,
): Promise<SandboxFsReadResponse | null> {
  const box = await resolveBox(identity, boxId)
  if (!box) return null
  assertReadPermission(identity, boxId)
  const containerPath = normalizeContainerPath(path)
  ensureBoxRunning(identity, box)
  const runtimeEntry = await ensureRuntimeBox(identity, boxId)
  const safePath = shQuote(containerPath)
  const safeMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0
    ? Math.min(10 * 1024 * 1024, Math.floor(maxBytes))
    : 1024 * 1024
  const readCmd = [
    `if [ ! -e ${safePath} ]; then exit 44; fi`,
    `if [ -d ${safePath} ]; then exit 45; fi`,
    `if [ ! -f ${safePath} ]; then exit 46; fi`,
    `size="$(wc -c < ${safePath} 2>/dev/null || echo 0)"`,
    `printf '__SIZE__\\t%s\\n' "${'$'}size"`,
    `head -c ${safeMaxBytes} ${safePath} | base64`,
  ].join('; ')

  const result = await execWithShellFallback(runtimeEntry.box, readCmd, {})
  if (result.exitCode === 44) throw new Error('path_not_found')
  if (result.exitCode === 45) throw new Error('not_file')
  if (result.exitCode === 46) throw new Error('not_file')
  if (result.exitCode !== 0) throw new Error(result.stderr || `Read failed with exit ${result.exitCode}`)

  const lines = result.stdout.split(/\r?\n/g)
  const sizeLine = lines.find((line) => line.startsWith('__SIZE__\t')) || ''
  const size = parseInteger(sizeLine.split('\t')[1]) ?? 0
  const contentBase64 = lines
    .filter((line) => !line.startsWith('__SIZE__\t'))
    .join('')
    .replace(/\s+/g, '')
  const mime = lookupMimeType(containerPath)
  return {
    path: containerPath,
    size,
    contentBase64,
    truncated: size > safeMaxBytes,
    mimeType: typeof mime === 'string' ? mime : null,
  }
}

export async function mkdirFsPath(
  identity: ActorIdentity,
  boxId: string,
  req: SandboxFsMkdirRequest,
): Promise<void> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) throw new Error('not_found')
    ensureSandboxMutability(identity, box)
    assertOperatePermission(identity, boxId)
    const containerPath = ensureNonRootPath(req.path)
    ensureBoxRunning(identity, box)
    const runtimeEntry = await ensureRuntimeBox(identity, boxId, { locked: true })
    const safePath = shQuote(containerPath)
    const recursive = req.recursive !== false
    const cmd = [
      `if [ -e ${safePath} ]; then exit 17; fi`,
      `mkdir ${recursive ? '-p ' : ''}${safePath}`,
    ].join('; ')

    const result = await execWithShellFallback(runtimeEntry.box, cmd, {})
    if (result.exitCode === 17) throw new Error('path_exists')
    if (result.exitCode !== 0) {
      if ((result.stderr || '').toLowerCase().includes('no such file')) {
        throw new Error('invalid_path')
      }
      throw new Error(result.stderr || `mkdir failed with exit ${result.exitCode}`)
    }
  })
}

export async function moveFsPath(
  identity: ActorIdentity,
  boxId: string,
  req: SandboxFsMoveRequest,
): Promise<void> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) throw new Error('not_found')
    ensureSandboxMutability(identity, box)
    assertOperatePermission(identity, boxId)
    const fromPath = ensureNonRootPath(req.fromPath)
    const toPath = ensureNonRootPath(req.toPath)
    ensureBoxRunning(identity, box)
    const runtimeEntry = await ensureRuntimeBox(identity, boxId, { locked: true })
    const safeFrom = shQuote(fromPath)
    const safeTo = shQuote(toPath)
    const parent = shQuote(getContainerParentPath(toPath) || '/')
    const overwrite = !!req.overwrite

    const cmd = [
      `if [ ! -e ${safeFrom} ]; then exit 44; fi`,
      `if [ ! -d ${parent} ]; then exit 47; fi`,
      `${overwrite ? '' : `if [ -e ${safeTo} ]; then exit 17; fi`}`,
      `${overwrite ? `rm -rf ${safeTo};` : ''} mv ${safeFrom} ${safeTo}`,
    ].join('; ')

    const result = await execWithShellFallback(runtimeEntry.box, cmd, {})
    if (result.exitCode === 44) throw new Error('path_not_found')
    if (result.exitCode === 47) throw new Error('invalid_path')
    if (result.exitCode === 17) throw new Error('path_exists')
    if (result.exitCode !== 0) throw new Error(result.stderr || `move failed with exit ${result.exitCode}`)
  })
}

export async function deleteFsPath(
  identity: ActorIdentity,
  boxId: string,
  path: string,
  recursive = false,
): Promise<void> {
  return withSandboxLock(boxId, async () => {
    const box = await resolveBox(identity, boxId)
    if (!box) throw new Error('not_found')
    ensureSandboxMutability(identity, box)
    assertOperatePermission(identity, boxId)
    const containerPath = ensureNonRootPath(path)
    ensureBoxRunning(identity, box)
    const runtimeEntry = await ensureRuntimeBox(identity, boxId, { locked: true })
    const safePath = shQuote(containerPath)
    const cmd = recursive
      ? [
          `if [ ! -e ${safePath} ]; then exit 44; fi`,
          `rm -rf ${safePath}`,
        ].join('; ')
      : [
          `if [ ! -e ${safePath} ]; then exit 44; fi`,
          `if [ -d ${safePath} ]; then rmdir ${safePath}; else rm -f ${safePath}; fi`,
        ].join('; ')

    const result = await execWithShellFallback(runtimeEntry.box, cmd, {})
    if (result.exitCode === 44) throw new Error('path_not_found')
    if (!recursive && result.exitCode !== 0) {
      const stderr = (result.stderr || '').toLowerCase()
      if (stderr.includes('directory not empty') || stderr.includes('not empty')) {
        throw new Error('dir_not_empty')
      }
    }
    if (result.exitCode !== 0) throw new Error(result.stderr || `delete failed with exit ${result.exitCode}`)
  })
}

export async function importHostPath(identity: ActorIdentity, boxId: string, req: HostImportRequest): Promise<void> {
  const hostPath = ensureHostPath(req.hostPath)
  const destPath = ensureContainerPath(req.destPath)

  const box = await resolveBox(identity, boxId)
  if (!box) throw new Error('not_found')
  ensureSandboxMutability(identity, box)
  assertOperatePermission(identity, boxId)
  ensureBoxRunning(identity, box)
  const stat = statSync(hostPath)

  if (stat.isFile()) {
    const contentBase64 = readFileSync(hostPath).toString('base64')
    const target = destPath.endsWith('/') ? `${destPath}${hostPath.split('/').pop()}` : destPath
    await uploadFileContent(identity, boxId, target, contentBase64, true)
    return
  }

  if (!stat.isDirectory()) {
    throw new Error('hostPath must be a file or directory')
  }

  const parent = dirname(hostPath)
  const base = hostPath.split('/').pop() || '.'

  const tarBase64 = execSync(
    `tar -cf - -C ${shQuote(parent)} ${shQuote(base)} | base64`,
    { encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 },
  ).replace(/\s+/g, '')

  const runtimeEntry = await ensureRuntimeBox(identity, boxId)
  const safeDest = shQuote(destPath)
  const safeB64 = shQuote(tarBase64)
  const importCmd = [
    `mkdir -p ${safeDest}`,
    `printf '%s' ${safeB64} | base64 -d > /tmp/dune-import.tar`,
    `tar -xf /tmp/dune-import.tar -C ${safeDest}`,
    'rm -f /tmp/dune-import.tar',
  ].join(' && ')

  const result = await execWithShellFallback(runtimeEntry.box, importCmd, {})
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Import failed with exit ${result.exitCode}`)
  }
}
