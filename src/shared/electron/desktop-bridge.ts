import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type { CreateAgentInput } from '@/renderer/features/agents/types';

export interface DesktopRuntimeBridge {
  createAgent?: (input: CreateAgentInput) => Promise<string>;
  getRuntimeSnapshot?: () => Promise<AgentServiceSnapshot>;
  resetRuntime?: () => Promise<void>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
}

export interface DesktopBridge extends DesktopRuntimeBridge {
  isMac: boolean;
  platform: NodeJS.Platform;
}

export function createDesktopBridge(
  platform: NodeJS.Platform,
  runtimeBridge: DesktopRuntimeBridge = {},
): DesktopBridge {
  return {
    isMac: platform === 'darwin',
    platform,
    ...runtimeBridge,
  };
}
