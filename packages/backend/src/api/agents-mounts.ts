import { Hono } from 'hono'
import * as agentStore from '../storage/agent-store.js'
import * as agentRuntimeMountStore from '../storage/agent-runtime-mount-store.js'
import * as agentManager from '../agents/agent-manager.js'
import { mapAgentMountErrorToResponse, getPickHostDirectoryImpl, HostDirectoryPickerError } from './agents-validation.js'
import type { CreateAgentMountRequest, UpdateAgentMountRequest } from '@dune/shared'

export const agentsMountsApi = new Hono()

agentsMountsApi.get('/:id/mounts', (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(agentRuntimeMountStore.listAgentRuntimeMounts(agentId))
})

agentsMountsApi.post('/:id/mounts/select-host-directory', async (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  try {
    const result = await getPickHostDirectoryImpl()()
    return c.json(result, 200)
  } catch (err: any) {
    if (err instanceof HostDirectoryPickerError) {
      if (err.code === 'picker_unavailable') {
        return c.json({ error: 'folder_picker_unavailable' }, 503)
      }
      return c.json({ error: 'folder_picker_failed' }, 500)
    }
    return c.json({ error: 'folder_picker_failed' }, 500)
  }
})

agentsMountsApi.post('/:id/mounts', async (c) => {
  const agentId = c.req.param('id')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agentManager.isAgentRunning(agentId)) {
    return c.json({ error: 'agent_running_stop_required' }, 409)
  }

  try {
    const body = await c.req.json() as CreateAgentMountRequest
    const created = agentRuntimeMountStore.createAgentRuntimeMount(agentId, {
      hostPath: String(body.hostPath || ''),
      guestPath: String(body.guestPath || ''),
      readOnly: body.readOnly === undefined ? true : !!body.readOnly,
    })
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
    return c.json(created, 201)
  } catch (err: any) {
    if (String(err?.message || '').startsWith('Failed to reset runtime sandbox')) {
      return c.json({ error: err.message }, 500)
    }
    return mapAgentMountErrorToResponse(c, err)
  }
})

agentsMountsApi.patch('/:id/mounts/:mountId', async (c) => {
  const agentId = c.req.param('id')
  const mountId = c.req.param('mountId')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agentManager.isAgentRunning(agentId)) {
    return c.json({ error: 'agent_running_stop_required' }, 409)
  }

  try {
    const body = await c.req.json() as UpdateAgentMountRequest
    const updated = agentRuntimeMountStore.updateAgentRuntimeMount(agentId, mountId, {
      hostPath: body.hostPath === undefined ? undefined : String(body.hostPath || ''),
      guestPath: body.guestPath === undefined ? undefined : String(body.guestPath || ''),
      readOnly: body.readOnly === undefined ? undefined : !!body.readOnly,
    })
    if (!updated) return c.json({ error: 'not_found' }, 404)
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
    return c.json(updated)
  } catch (err: any) {
    if (String(err?.message || '').startsWith('Failed to reset runtime sandbox')) {
      return c.json({ error: err.message }, 500)
    }
    return mapAgentMountErrorToResponse(c, err)
  }
})

agentsMountsApi.delete('/:id/mounts/:mountId', async (c) => {
  const agentId = c.req.param('id')
  const mountId = c.req.param('mountId')
  const agent = agentStore.getAgent(agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agentManager.isAgentRunning(agentId)) {
    return c.json({ error: 'agent_running_stop_required' }, 409)
  }

  const deleted = agentRuntimeMountStore.deleteAgentRuntimeMount(agentId, mountId)
  if (!deleted) return c.json({ error: 'not_found' }, 404)
  try {
    await agentManager.resetStoppedAgentRuntimeSandbox(agentId)
    return c.body(null, 204)
  } catch (err: any) {
    if (String(err?.message || '').startsWith('Failed to reset runtime sandbox')) {
      return c.json({ error: err.message }, 500)
    }
    return c.json({ error: err?.message || 'mount_error' }, 500)
  }
})
