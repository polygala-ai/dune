/**
 * Typed event bus — wraps broadcast.ts with a discriminated union for all WS events.
 * Use emit/emitToChannel/emitToAgent instead of sendToAll/sendToChannel/sendToAgent.
 */
import { sendToAll, sendToChannel, sendToAgent } from './broadcast.js'
import type { Message, AgentLogEntry, AgentStatusType, HostOperatorRequest, Todo } from '@dune/shared'

export type DuneEvent =
  | { type: 'message:new'; payload: Message }
  | { type: 'message:update'; payload: { id: string; content: string; isStreaming?: boolean } }
  | { type: 'agent:status'; payload: { agentId: string; status: AgentStatusType } }
  | { type: 'agent:typing'; payload: { agentId: string; channelId: string; isTyping: boolean } }
  | { type: 'agent:log'; payload: { agentId: string; entries: AgentLogEntry[] } }
  | { type: 'agent:screen'; payload: { agentId: string; guiHttpPort: number; guiHttpsPort: number; width: number; height: number } }
  | { type: 'todo:change'; payload: Todo }
  | { type: 'todo:delete'; payload: { id: string; agentId: string } }
  | { type: 'host-operator:pending'; payload: HostOperatorRequest }
  | { type: 'host-operator:updated'; payload: HostOperatorRequest }
  | { type: 'host-command:pending'; payload: unknown }
  | { type: 'host-command:updated'; payload: unknown }
  | { type: 'workspace:invalidate'; payload: { resources: string[]; reason?: string } }

export function emit(event: DuneEvent): void {
  sendToAll(event)
}

export function emitToChannel(channelId: string, event: DuneEvent): void {
  sendToChannel(channelId, event)
}

export function emitToAgent(agentId: string, event: DuneEvent): void {
  sendToAgent(agentId, event)
}
