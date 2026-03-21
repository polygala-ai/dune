import type { Handler } from '../protocol.js'
import * as agentStore from '../../storage/agent-store.js'
import * as agentRuntimeMountStore from '../../storage/agent-runtime-mount-store.js'
import * as agentManager from '../../agents/agent-manager.js'
import {
  HostDirectoryPickerError,
  pickHostDirectory,
} from '../../utils/host-directory-picker.js'

export function registerMountHandlers(h: (method: string, fn: Handler) => void): void {
  h('agents.listMounts', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    return agentRuntimeMountStore.listAgentRuntimeMounts(agent.id)
  })

  h('agents.createMount', async (params) => {
    const agentId = params.id as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    if (agentManager.isAgentRunning(agentId)) throw new Error('agent_running_stop_required')
    const created = agentRuntimeMountStore.createAgentRuntimeMount(agentId, {
      hostPath: String(params.hostPath || ''),
      guestPath: String(params.guestPath || ''),
      readOnly: params.readOnly === undefined ? true : !!params.readOnly,
    })
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
    return created
  })

  h('agents.updateMount', async (params) => {
    const agentId = params.id as string
    const mountId = params.mountId as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    if (agentManager.isAgentRunning(agentId)) throw new Error('agent_running_stop_required')
    const updated = agentRuntimeMountStore.updateAgentRuntimeMount(agentId, mountId, {
      hostPath: params.hostPath === undefined ? undefined : String(params.hostPath || ''),
      guestPath: params.guestPath === undefined ? undefined : String(params.guestPath || ''),
      readOnly: params.readOnly === undefined ? undefined : !!params.readOnly,
    })
    if (!updated) throw new Error('not_found')
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
    return updated
  })

  h('agents.deleteMount', async (params) => {
    const agentId = params.id as string
    const mountId = params.mountId as string
    const agent = agentStore.getAgent(agentId)
    if (!agent) throw new Error('not_found')
    if (agentManager.isAgentRunning(agentId)) throw new Error('agent_running_stop_required')
    const deleted = agentRuntimeMountStore.deleteAgentRuntimeMount(agentId, mountId)
    if (!deleted) throw new Error('not_found')
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
  })

  h('agents.selectMountHostDir', async (params) => {
    const agent = agentStore.getAgent(params.id as string)
    if (!agent) throw new Error('not_found')
    try {
      return await pickHostDirectory()
    } catch (err: any) {
      if (err instanceof HostDirectoryPickerError) {
        throw new Error(err.code === 'picker_unavailable' ? 'folder_picker_unavailable' : 'folder_picker_failed')
      }
      throw new Error('folder_picker_failed')
    }
  })
}
