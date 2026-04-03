import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type { CreateAgentInput } from '@/renderer/features/agents/types';

/** Methods are optional to support browser-only fallback (no Electron preload). */
export interface DesktopBridge {
  platform: NodeJS.Platform;
  createAgent?: (input: CreateAgentInput) => Promise<string>;
  deleteAgent?: (agentId: string) => Promise<void>;
  getRuntimeSnapshot?: () => Promise<AgentServiceSnapshot>;
  resetRuntime?: () => Promise<void>;
  restartApp?: () => Promise<void>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  storageDelete?: (store: string, key: string) => Promise<void>;
  storageGet?: (store: string, key: string) => Promise<unknown>;
  storageKeys?: (store: string) => Promise<string[]>;
  storageSet?: (store: string, key: string, value: unknown) => Promise<void>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
}
