import type { SimpleBox } from '@boxlite-ai/boxlite'

/** Run box.exec with a timeout. BoxLite exec can hang if the container socket dies. */
export async function timedExec(
  box: SimpleBox, cmd: string, args: string[], env: Record<string, string>, timeoutMs = 60_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const execPromise = box.exec(cmd, args, env)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`box.exec timed out after ${timeoutMs}ms: ${cmd} ${args[0] ?? ''}`)), timeoutMs)
  )
  return Promise.race([execPromise, timeoutPromise])
}

/** Run box.exec with timeout + retry. For startup paths where transient gRPC hangs are common. */
export async function retriedExec(
  box: SimpleBox, cmd: string, args: string[], env: Record<string, string>,
  timeoutMs = 30_000, maxRetries = 3,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await timedExec(box, cmd, args, env, timeoutMs)
    } catch (err: any) {
      const msg = err.message || ''
      const isTransient = msg.includes('transport error')
        || msg.includes('spawn_failed')
        || msg.includes('timed out')
        || msg.includes('notify socket')
        || msg.includes('Libcontainer')
      if (!isTransient || attempt === maxRetries) throw err
      console.warn(`[retry ${attempt}/${maxRetries}] ${cmd} ${args[0]?.slice(0, 30)}... failed: ${msg.slice(0, 100)}`)
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('unreachable')
}

export function summarizeExecOutput(output: string, max = 240): string {
  if (!output) return ''
  const compact = output.replace(/\s+/g, ' ').trim()
  return compact.length <= max ? compact : `${compact.slice(0, max)}...`
}

export async function execChecked(
  box: SimpleBox,
  cmd: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 30_000,
  maxRetries = 3,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await retriedExec(box, cmd, args, env, timeoutMs, maxRetries)
  if (result.exitCode !== 0) {
    const stdout = summarizeExecOutput(result.stdout)
    const stderr = summarizeExecOutput(result.stderr)
    throw new Error(
      `Command failed: ${cmd} ${args.join(' ')} (exit ${result.exitCode})`
      + `${stdout ? ` stdout="${stdout}"` : ''}`
      + `${stderr ? ` stderr="${stderr}"` : ''}`,
    )
  }
  return result
}

export async function readContainerTextFile(box: SimpleBox, path: string): Promise<string> {
  const result = await execChecked(
    box,
    'python3',
    ['-c', 'import sys; print(open(sys.argv[1]).read(), end="")', path],
    { DISPLAY: ':1' },
    20_000,
    2,
  )
  return result.stdout
}

export async function writeContainerTextFile(box: SimpleBox, path: string, content: string): Promise<void> {
  await execChecked(
    box,
    'python3',
    ['-c', 'import sys; open(sys.argv[1],"w").write(sys.argv[2])', path, content],
    { DISPLAY: ':1' },
    20_000,
    2,
  )
}

/** Deploy a file into the container via base64 encoding to avoid shell escaping issues. */
export async function deployFile(box: SimpleBox, content: string, destPath: string): Promise<void> {
  const b64 = Buffer.from(content).toString('base64')
  await execChecked(box, 'bash', ['-c',
    `printf '%s' '${b64}' | base64 -d > ${destPath} && chown abc:abc ${destPath}`
  ], { DISPLAY: ':1' })
}

export function escapeShellSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''")
}

export function buildEnvAssignments(values: Record<string, string | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}='${escapeShellSingleQuotes(value || '')}'`)
    .join(' ')
}

/** Run a command with real-time stdout streaming via BoxLite's low-level exec API. */
const ABORTED_SENTINEL = Symbol('aborted')

export async function streamingExec(
  box: SimpleBox,
  cmd: string,
  args: string[],
  env: Record<string, string>,
  onStdoutLine: (line: string) => void,
  timeoutMs = 300_000,
  onExecutionStart?: (execution: { kill: () => Promise<void> } | null) => void,
  abortSignal?: Promise<void>,
): Promise<{ exitCode: number; stdout: string; stderr: string; aborted?: boolean }> {
  const rawBox = await (box as any)._ensureBox()
  const envArray = Object.entries(env).map(([k, v]) => [k, v])
  const execution = await rawBox.exec(cmd, args, envArray, false)
  onExecutionStart?.(execution)

  const stdoutLines: string[] = []
  const stderrLines: string[] = []

  let timedOut = false
  let aborted = false
  const abortPromise = abortSignal?.then(() => ABORTED_SENTINEL)
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null
  const resetTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => {
      timedOut = true
      execution.kill().catch(() => {})
    }, timeoutMs)
  }
  resetTimer()

  try {
    const stdoutStream = await execution.stdout().catch((err: any) => {
      console.error(`[streamingExec] stdout() failed: ${err?.message}`)
      return null
    })
    const stderrStream = await execution.stderr().catch((err: any) => {
      console.error(`[streamingExec] stderr() failed: ${err?.message}`)
      return null
    })

    if (!stdoutStream) console.warn(`[streamingExec] stdoutStream is NULL for: ${cmd} ${args[0]?.slice(0, 50)}`)

    const readStdout = async () => {
      if (!stdoutStream) return
      let buffer = ''
      let lineCount = 0
      while (true) {
        const next = stdoutStream.next()
        const chunk = abortPromise ? await Promise.race([next, abortPromise]) : await next
        if (chunk === ABORTED_SENTINEL || chunk === null) {
          if (chunk === ABORTED_SENTINEL) aborted = true
          if (buffer) {
            lineCount++
            stdoutLines.push(buffer)
            onStdoutLine(buffer)
          }
          break
        }
        buffer += chunk
        const parts = buffer.split('\n')
        buffer = parts.pop()!
        for (const line of parts) {
          if (!line) continue
          lineCount++
          if (lineCount <= 3) console.log(`[streamingExec] stdout line ${lineCount}: ${line.slice(0, 120)}`)
          stdoutLines.push(line)
          onStdoutLine(line)
          resetTimer()
        }
      }
      console.log(`[streamingExec] stdout total lines: ${lineCount}${aborted ? ' (aborted)' : ''}`)
    }

    const readStderr = async () => {
      if (!stderrStream) return
      while (true) {
        const next = stderrStream.next()
        const line = abortPromise ? await Promise.race([next, abortPromise]) : await next
        if (line === ABORTED_SENTINEL || line === null) break
        stderrLines.push(line as string)
      }
    }

    await Promise.all([readStdout(), readStderr()])

    if (aborted) {
      await execution.kill().catch(() => {})
      return {
        exitCode: 130,
        stdout: stdoutLines.join(''),
        stderr: stderrLines.join(''),
        aborted: true,
      }
    }

    const result = await execution.wait()

    if (timedOut) {
      throw new Error(`streamingExec timed out after ${timeoutMs}ms: ${cmd}`)
    }

    return {
      exitCode: result.exitCode,
      stdout: stdoutLines.join(''),
      stderr: stderrLines.join(''),
    }
  } finally {
    onExecutionStart?.(null)
    if (inactivityTimer) clearTimeout(inactivityTimer)
  }
}
