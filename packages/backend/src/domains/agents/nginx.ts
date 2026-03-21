import { SimpleBox } from '@boxlite-ai/boxlite'
import { retriedExec, readContainerTextFile, writeContainerTextFile, execChecked } from './container-exec.js'
import {
  NGINX_CONFIG_CANDIDATES,
  NGINX_WEBSOCKET_ANCHOR,
  MINIAPP_LOCATION_BLOCK,
  WEBRTC_LOCATION_BLOCK,
} from './constants.js'
import type { MiniappNginxPatchResult } from './constants.js'
import { runningAgents } from './runtime-state.js'

export function patchMiniappNginxRouting(configText: string): MiniappNginxPatchResult {
  const websocketCount = (configText.match(/location \/websocket/g) || []).length
  if (websocketCount === 0) {
    throw new Error('location /websocket anchor not found in nginx config')
  }

  const miniappsCount = (configText.match(/location \/miniapps\//g) || []).length
  const webrtcCount = (configText.match(/location \/webrtc/g) || []).length
  if (miniappsCount >= websocketCount && webrtcCount >= websocketCount) {
    return { text: configText, changed: false }
  }

  if (!configText.includes(NGINX_WEBSOCKET_ANCHOR)) {
    throw new Error('location /websocket anchor not found in nginx config')
  }

  const insertionParts: string[] = []
  if (miniappsCount < websocketCount) insertionParts.push(MINIAPP_LOCATION_BLOCK)
  if (webrtcCount < websocketCount) insertionParts.push(WEBRTC_LOCATION_BLOCK)
  const insertion = `${insertionParts.join('\n\n')}\n\n`
  const text = configText.replaceAll(NGINX_WEBSOCKET_ANCHOR, `${insertion}${NGINX_WEBSOCKET_ANCHOR}`)
  return { text, changed: true }
}

export async function resolveNginxConfigPath(box: SimpleBox): Promise<string> {
  for (const path of NGINX_CONFIG_CANDIDATES) {
    const probe = await retriedExec(box, 'bash', ['-lc', `[ -f "${path}" ] && echo "${path}"`], { DISPLAY: ':1' }, 10_000, 2)
    if (probe.exitCode === 0 && probe.stdout.trim() === path) {
      return path
    }
  }
  throw new Error(`No nginx default config found in known paths: ${NGINX_CONFIG_CANDIDATES.join(', ')}`)
}

export async function ensureMiniappNginxConfiguredInBox(box: SimpleBox, agentId: string): Promise<void> {
  const configPath = await resolveNginxConfigPath(box)
  const currentConfig = await readContainerTextFile(box, configPath)
  const patched = patchMiniappNginxRouting(currentConfig)
  if (patched.changed) {
    await writeContainerTextFile(box, configPath, patched.text)
  }

  await execChecked(box, 'bash', ['-lc', 'nginx -t'], { DISPLAY: ':1' }, 20_000, 2)
  await execChecked(box, 'bash', ['-lc', 'nginx -s reload'], { DISPLAY: ':1' }, 20_000, 2)
  console.log(`${patched.changed ? 'Patched' : 'Verified'} nginx miniapp routes for agent ${agentId}`)
}

export async function ensureMiniappNginxConfigured(agentId: string): Promise<void> {
  const running = runningAgents.get(agentId)
  if (!running) throw new Error(`Agent ${agentId} is not running`)
  await ensureMiniappNginxConfiguredInBox(running.box, agentId)
}
