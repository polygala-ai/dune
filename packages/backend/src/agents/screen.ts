import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from './constants.js'
import { runningAgents } from './runtime-state.js'

/** Take a screenshot of the agent's desktop via PIL. */
export async function takeScreenshot(agentId: string): Promise<{ data: string; width: number; height: number; format: string }> {
  const running = runningAgents.get(agentId)
  if (!running) throw new Error(`Agent ${agentId} is not running`)

  const pythonCode = `
from PIL import ImageGrab
import io, base64
img = ImageGrab.grab()
buf = io.BytesIO()
img.save(buf, format="PNG")
print(base64.b64encode(buf.getvalue()).decode("utf-8"))
`
  const result = await running.box.exec('python3', ['-c', pythonCode], { DISPLAY: ':1' })
  if (result.exitCode !== 0) {
    throw new Error(`Screenshot failed: ${result.stderr}`)
  }
  return { data: result.stdout.trim(), width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, format: 'png' }
}

/** Get screen info (ports, dimensions) for a running agent. */
export function getAgentScreen(agentId: string): { guiHttpPort: number; guiHttpsPort: number; width: number; height: number } | null {
  const running = runningAgents.get(agentId)
  if (!running) return null
  return {
    guiHttpPort: running.guiHttpPort,
    guiHttpsPort: running.guiHttpsPort,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
  }
}

export function getAgentHttpBaseUrl(agentId: string): string | null {
  const running = runningAgents.get(agentId)
  if (!running) return null
  return `http://localhost:${running.guiHttpPort}`
}

/** Debug: run a command in the agent's box and return the result. */
export async function debugExec(agentId: string, cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const running = runningAgents.get(agentId)
  if (!running) throw new Error(`Agent ${agentId} is not running`)
  const result = await running.box.exec(cmd, args, { DISPLAY: ':1', SHELL: '/bin/bash' })
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
}
