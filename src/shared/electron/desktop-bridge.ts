import type { AgentServiceSnapshot } from '@/renderer/features/agents/model/agent-service';
import type {
  CreateAgentInput,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { ProjectArtifactEntry } from '@/shared/workflow/project-artifacts';

/** Methods are optional to support browser-only fallback (no Electron preload). */
export interface DesktopBridge {
  applyNetworkSettings?: () => Promise<void>;
  cancelTelegramSetupSession?: (sessionId: string) => Promise<void>;
  copyText?: (text: string) => Promise<void>;
  platform: NodeJS.Platform;
  createAgent?: (input: CreateAgentInput) => Promise<string>;
  deleteLocalData?: () => Promise<void>;
  deleteAgent?: (agentId: string) => Promise<void>;
  ensureProjectArtifactFolder?: (rootPath: string, artifactFolderName: string) => Promise<string>;
  ensureProjectMainAgent?: (
    projectId: string,
    projectName: string,
    projectRootPath?: string | null,
  ) => Promise<string>;
  getRuntimeSnapshot?: () => Promise<AgentServiceSnapshot>;
  getTelegramSetupSession?: (sessionId: string) => Promise<TelegramSetupSession | null>;
  listProjectArtifactEntries?: (
    rootPath: string,
    artifactFolderName: string,
  ) => Promise<ProjectArtifactEntry[]>;
  openExternal?: (url: string) => Promise<void>;
  openPath?: (targetPath: string) => Promise<void>;
  prepareProjectRootPath?: (rootPath: string, artifactFolderNames: string[]) => Promise<string>;
  reloadExternalChannels?: () => Promise<void>;
  resetRuntime?: () => Promise<void>;
  restartApp?: () => Promise<void>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  startAgentIpc?: () => Promise<void>;
  startTelegramSetupSession?: (input: StartTelegramSetupSessionInput) => Promise<string>;
  stopAgentIpc?: () => Promise<void>;
  storageDelete?: (store: string, key: string) => Promise<void>;
  storageGet?: (store: string, key: string) => Promise<unknown>;
  storageKeys?: (store: string) => Promise<string[]>;
  storageSet?: (store: string, key: string, value: unknown) => Promise<void>;
  selectProjectDirectory?: () => Promise<string | null>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
  subscribeWorkflowChanged?: (listener: () => void) => () => void;
  updateAgentChannel?: (input: UpdateAgentChannelInput) => Promise<void>;
}
