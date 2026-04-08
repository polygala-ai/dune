import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';

/** Methods are optional to support browser-only fallback (no Electron preload). */
export interface DesktopBridge {
  applyNetworkSettings?: () => Promise<void>;
  cancelTelegramSetupSession?: (sessionId: string) => Promise<void>;
  copyText?: (text: string) => Promise<void>;
  platform: NodeJS.Platform;
  createAgent?: (input: CreateAgentInput) => Promise<string>;
  deleteAgent?: (agentId: string) => Promise<void>;
  ensureProjectMainAgent?: (projectId: string, projectName: string) => Promise<string>;
  getRuntimeSnapshot?: () => Promise<AgentServiceSnapshot>;
  getTelegramSetupSession?: (sessionId: string) => Promise<TelegramSetupSession | null>;
  openExternal?: (url: string) => Promise<void>;
  reloadExternalChannels?: () => Promise<void>;
  resetRuntime?: () => Promise<void>;
  restartApp?: () => Promise<void>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  startTelegramSetupSession?: (input: StartTelegramSetupSessionInput) => Promise<string>;
  storageDelete?: (store: string, key: string) => Promise<void>;
  storageGet?: (store: string, key: string) => Promise<unknown>;
  storageKeys?: (store: string) => Promise<string[]>;
  storageSet?: (store: string, key: string, value: unknown) => Promise<void>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
}
