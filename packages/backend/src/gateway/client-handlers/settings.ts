import type { Handler } from '../protocol.js'
import * as claudeSettingsStore from '../../storage/claude-settings-store.js'
import * as agentManager from '../../agents/agent-manager.js'
import { config } from '../../config.js'
import { parseClaudeSettingsUpdate } from './validation.js'

export function registerSettingsHandlers(h: (method: string, fn: Handler) => void): void {
  h('settings.getClaude', async () => {
    return claudeSettingsStore.getClaudeSettingsSummary()
  })

  h('settings.updateClaude', async (params) => {
    const parsed = parseClaudeSettingsUpdate(params)
    if (!parsed.value) throw new Error(parsed.error || 'Invalid JSON body')
    const summary = claudeSettingsStore.patchClaudeSettings(parsed.value)
    await agentManager.syncClaudeSettingsForRunningAgents()
    return summary
  })

  h('settings.getAdminPlane', async () => {
    return {
      hostCommandAdminBaseUrl: `http://127.0.0.1:${config.adminPort}`,
      hostOperatorAdminBaseUrl: `http://127.0.0.1:${config.adminPort}`,
    }
  })
}
