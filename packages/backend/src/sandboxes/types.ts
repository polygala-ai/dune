import type { SandboxActorTypeType } from '@dune/shared'

export type ActorIdentity = {
  actorType: SandboxActorTypeType
  actorId: string
}

export type ActiveSandboxRuntime = {
  sandboxId: string
  box: import('@boxlite-ai/boxlite').SimpleBox
  hostPortsByGuest: Map<number, number>
}

export type AgentManagedSandbox = {
  sandboxId: string
  agentId: string
  status: 'running' | 'stopped'
  startedAt: number
  name: string
}
