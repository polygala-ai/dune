import { state } from '../state/app-state.js'
import { WsClient } from './rpc.js'
import type { HostOperatorRequest } from '@dune/shared'

export type WorkspaceSyncCallbacks = {
  /** Called when a workspace:invalidate or ws:reconnect fires */
  onWorkspaceInvalidate: () => void
  /** Called on ws:reconnect (in addition to onWorkspaceInvalidate) */
  onReconnect: () => void
  /** Called when a new pending host-operator request arrives */
  onHostApprovalPending: (request: HostOperatorRequest) => void
  /** Called when a host-operator request is updated */
  onHostApprovalUpdated: (request: HostOperatorRequest) => void
  /** Called when agent:status arrives, with the agentId */
  onAgentStatus: (agentId: string) => void
}

/**
 * Creates a WsClient, wires all workspace-level WS event handlers, and returns the client.
 * The caller (app-shell) handles higher-level coordination logic via callbacks.
 */
export function initWorkspaceSync(callbacks: WorkspaceSyncCallbacks): WsClient {
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${location.host}/ws`
  const ws = new WsClient(wsUrl)
  state.ws = ws

  ws.on('message:new', (payload) => {
    state.addMessage(payload)
  })

  ws.on('message:update', (payload) => {
    state.updateMessage(payload.id, payload.content, payload.isStreaming)
  })

  ws.on('agent:status', (payload) => {
    callbacks.onAgentStatus(payload.agentId)
    state.updateAgentStatus(payload.agentId, payload.status)
  })

  ws.on('agent:typing', (payload) => {
    state.setTyping(payload.channelId, payload.agentId, payload.isTyping)
  })

  ws.on('agent:log', (payload) => {
    state.appendAgentLogs(payload.agentId, payload.entries)
  })

  ws.on('agent:screen', (payload) => {
    state.setAgentScreen(payload.agentId, payload)
  })

  ws.on('workspace:invalidate', () => {
    callbacks.onWorkspaceInvalidate()
  })

  ws.on('ws:reconnect', () => {
    callbacks.onWorkspaceInvalidate()
    callbacks.onReconnect()
  })

  ws.on('host-operator:pending', (payload: HostOperatorRequest) => {
    state.upsertHostOperatorRequest(payload)
    if (payload.status === 'pending') {
      callbacks.onHostApprovalPending(payload)
    }
  })

  ws.on('host-operator:updated', (payload: HostOperatorRequest) => {
    state.upsertHostOperatorRequest(payload)
    callbacks.onHostApprovalUpdated(payload)
  })

  return ws
}
