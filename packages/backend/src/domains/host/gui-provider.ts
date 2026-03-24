import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type {
  HostOperatorActCreateRequest,
  HostOperatorCreateRequest,
  HostOperatorFilesystemCreateRequest,
  HostOperatorOverviewCreateRequest,
  HostOperatorPerceiveCreateRequest,
  HostOperatorRunningApp,
  HostOperatorStatusCreateRequest,
} from '@dune/shared'

export type HostOperatorArtifact = {
  name: string
  contentBase64: string
}

export type HostOperatorProviderResult = {
  resultJson: unknown
  artifacts?: HostOperatorArtifact[]
}

export type HostOperatorProviderStatus = {
  available: boolean
  platform: NodeJS.Platform
  provider: string
  reason?: string
  rescreenPath?: string
}

export interface HostOperatorProvider {
  readonly name: string
  readonly platform: NodeJS.Platform
  listApps(): Promise<HostOperatorRunningApp[]>
  overview(input: HostOperatorOverviewCreateRequest): Promise<HostOperatorProviderResult>
  perceive(input: HostOperatorPerceiveCreateRequest): Promise<HostOperatorProviderResult>
  act(input: HostOperatorActCreateRequest): Promise<HostOperatorProviderResult>
  status(input: HostOperatorStatusCreateRequest): Promise<HostOperatorProviderResult>
  filesystem(input: HostOperatorFilesystemCreateRequest): Promise<HostOperatorProviderResult>
}

// ── MCP protocol types ──────────────────────────────────────────────────

type McpResponse = {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

type McpContentItem = {
  type: 'text' | 'image'
  text?: string
  data?: string
  mimeType?: string
}

type McpToolResult = {
  content?: McpContentItem[]
  isError?: boolean
}

// ── Rescreen MCP invocation ─────────────────────────────────────────────

let mcpRequestId = 0

async function listRunningBundleIds(rescreenPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn(rescreenPath, ['--list-apps'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += String(chunk) })
    child.on('close', () => {
      // --list-apps outputs to stderr in format: "  AppName    com.bundle.id"
      const ids = stderr.split('\n')
        .map((line) => line.trim().split(/\s{2,}/).pop() || '')
        .filter((id) => id.includes('.') && !id.includes(' '))
      resolve([...new Set(ids)])
    })
    child.on('error', () => resolve([]))
    child.stdin.end()
  })
}

async function invokeRescreen(
  rescreenPath: string,
  toolName: string,
  args: Record<string, unknown>,
  permittedApps?: string[],
): Promise<HostOperatorProviderResult> {
  if (!existsSync(rescreenPath)) {
    throw new Error('host_operator_unavailable')
  }

  const cliArgs: string[] = []
  if (permittedApps && permittedApps.length > 0) {
    for (const app of permittedApps) {
      cliArgs.push('--app', app)
    }
  } else {
    // Need at least one --app; get all running apps
    const allApps = await listRunningBundleIds(rescreenPath)
    if (allApps.length === 0) {
      return { resultJson: 'No running applications detected.' }
    }
    for (const app of allApps) {
      cliArgs.push('--app', app)
    }
  }

  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: ++mcpRequestId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'dune-backend', version: '1.0' },
    },
  })

  const callMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: ++mcpRequestId,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  })

  const responses = await new Promise<McpResponse[]>((resolve, reject) => {
    const child = spawn(rescreenPath, cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('host_operator_timeout'))
    }, 60_000)

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const lines = stdout.trim().split('\n').filter(Boolean)
      try {
        resolve(lines.map((line) => JSON.parse(line) as McpResponse))
      } catch (err: any) {
        reject(new Error(stderr.trim() || err?.message || 'host_operator_invalid_response'))
      }
    })

    child.stdin.write(initMsg + '\n')
    child.stdin.write(callMsg + '\n')
    child.stdin.end()
  })

  // Find the tools/call response (last one with a result)
  const callResponse = responses.find((r) => r.id === mcpRequestId)
  if (!callResponse) {
    throw new Error('host_operator_no_response')
  }
  if (callResponse.error) {
    throw new Error(callResponse.error.message || 'host_operator_failed')
  }

  const toolResult = callResponse.result as McpToolResult | undefined
  if (!toolResult) {
    return { resultJson: null }
  }

  if (toolResult.isError) {
    const errorText = toolResult.content?.find((c) => c.type === 'text')?.text || 'unknown error'
    throw new Error(errorText)
  }

  // Extract text and image content
  const content = toolResult.content || []
  const textParts = content.filter((c) => c.type === 'text').map((c) => c.text || '')
  const imageParts = content.filter((c) => c.type === 'image')

  // Build artifacts from image content
  const artifacts: HostOperatorArtifact[] = imageParts.map((img, i) => ({
    name: `screenshot-${i + 1}.png`,
    contentBase64: img.data || '',
  }))

  // Try to parse the text as JSON for structured results
  let resultJson: unknown = null
  const combinedText = textParts.join('\n')
  if (combinedText) {
    try {
      resultJson = JSON.parse(combinedText)
    } catch {
      resultJson = combinedText
    }
  }

  // If we have images, wrap as Claude content blocks (matching existing format)
  if (artifacts.length > 0) {
    const blocks: unknown[] = []
    if (combinedText) blocks.push({ type: 'text', text: combinedText })
    for (const img of imageParts) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.data || '' },
      })
    }
    resultJson = { content: blocks }
  }

  return { resultJson, artifacts }
}

// ── Param translation (Dune → rescreen) ─────────────────────────────────

function translatePerceiveArgs(input: HostOperatorPerceiveCreateRequest): Record<string, unknown> {
  const args: Record<string, unknown> = { type: input.mode, target: input.bundleId }
  if (input.query) args.query = input.query
  return args
}

function translateActArgs(input: HostOperatorActCreateRequest): Record<string, unknown> {
  const args: Record<string, unknown> = { type: input.action }
  if (input.bundleId) args.target = input.bundleId
  if (input.text) args.value = input.text
  if (input.key) args.keys = input.key
  if (input.point) args.position = input.point
  if (input.toPoint) args.to = input.toPoint
  if (input.url) args.value = input.url // navigate uses value
  if (input.deltaX !== undefined || input.deltaY !== undefined) {
    const dy = input.deltaY ?? 0
    const dx = input.deltaX ?? 0
    args.direction = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right'
    args.amount = Math.abs(dy || dx) || 3
  }
  return args
}

function translateFilesystemArgs(input: HostOperatorFilesystemCreateRequest): Record<string, unknown> {
  const args: Record<string, unknown> = { operation: input.op }
  if (input.path) args.path = input.path
  if (input.content) args.content = input.content
  if (input.query) args.pattern = input.query
  return args
}

// ── Provider implementations ────────────────────────────────────────────

export class UnsupportedHostOperatorProvider implements HostOperatorProvider {
  readonly name = 'unsupported'

  constructor(
    readonly platform: NodeJS.Platform,
    private readonly reason: string,
  ) {}

  async listApps(): Promise<HostOperatorRunningApp[]> {
    throw new Error('host_operator_unavailable')
  }

  async overview(): Promise<HostOperatorProviderResult> {
    throw new Error('host_operator_unavailable')
  }

  async perceive(): Promise<HostOperatorProviderResult> {
    throw new Error('host_operator_unavailable')
  }

  async act(): Promise<HostOperatorProviderResult> {
    throw new Error('host_operator_unavailable')
  }

  async status(): Promise<HostOperatorProviderResult> {
    return {
      resultJson: {
        available: false,
        platform: this.platform,
        provider: this.name,
        reason: this.reason,
      } satisfies HostOperatorProviderStatus,
    }
  }

  async filesystem(): Promise<HostOperatorProviderResult> {
    throw new Error('host_operator_unavailable')
  }
}

export class DarwinRescreenProvider implements HostOperatorProvider {
  readonly name = 'darwin-rescreen'
  readonly platform: NodeJS.Platform = 'darwin'

  constructor(private readonly rescreenPath: string) {}

  async listApps(): Promise<HostOperatorRunningApp[]> {
    // Use rescreen_overview to get windows, then extract unique apps
    const result = await invokeRescreen(this.rescreenPath, 'rescreen_overview', {})
    // rescreen returns text with JSON array of windows
    const text = typeof result.resultJson === 'string' ? result.resultJson : JSON.stringify(result.resultJson)
    try {
      const windows = JSON.parse(text)
      if (!Array.isArray(windows)) return []
      const seen = new Set<string>()
      const apps: HostOperatorRunningApp[] = []
      for (const win of windows) {
        const bid = win.app || win.bundleId || ''
        if (bid && !seen.has(bid)) {
          seen.add(bid)
          apps.push({ bundleId: bid, appName: win.owner || bid, pid: 0, active: false })
        }
      }
      return apps
    } catch {
      return []
    }
  }

  async overview(input: HostOperatorOverviewCreateRequest): Promise<HostOperatorProviderResult> {
    const args: Record<string, unknown> = {}
    if (input.bundleId) args.target = input.bundleId
    return invokeRescreen(this.rescreenPath, 'rescreen_overview', args)
  }

  async perceive(input: HostOperatorPerceiveCreateRequest): Promise<HostOperatorProviderResult> {
    return invokeRescreen(this.rescreenPath, 'rescreen_perceive', translatePerceiveArgs(input), [input.bundleId])
  }

  async act(input: HostOperatorActCreateRequest): Promise<HostOperatorProviderResult> {
    const apps = input.bundleId ? [input.bundleId] : undefined
    return invokeRescreen(this.rescreenPath, 'rescreen_act', translateActArgs(input), apps)
  }

  async status(input: HostOperatorStatusCreateRequest): Promise<HostOperatorProviderResult> {
    if (!existsSync(this.rescreenPath)) {
      return {
        resultJson: {
          available: false,
          platform: this.platform,
          provider: this.name,
          reason: 'rescreen_missing',
          rescreenPath: this.rescreenPath,
        } satisfies HostOperatorProviderStatus,
      }
    }
    return invokeRescreen(this.rescreenPath, 'rescreen_status', {})
  }

  async filesystem(input: HostOperatorFilesystemCreateRequest): Promise<HostOperatorProviderResult> {
    return invokeRescreen(this.rescreenPath, 'rescreen_filesystem', translateFilesystemArgs(input))
  }
}

export function createDefaultHostOperatorProvider(options: {
  platform?: NodeJS.Platform
  helperPath: string
}): HostOperatorProvider {
  const platform = options.platform ?? process.platform
  if (platform === 'darwin') {
    return new DarwinRescreenProvider(options.helperPath)
  }
  return new UnsupportedHostOperatorProvider(platform, 'platform_not_supported')
}
