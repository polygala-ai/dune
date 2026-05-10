// Shared Electron desktop bridge contract.

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import type {
  AgentDefinition,
  AgentTranscriptPage,
  CreateAgentInput,
  RunIsolatedResearchInput,
  RunIsolatedResearchResult,
  StartTelegramSetupSessionInput,
  TelegramSetupSession,
  UpdateAgentChannelInput,
} from '@/renderer/features/agents/types';
import type { WorkflowProjectActivityPage } from '@/renderer/features/workflow/types';
import type { WorkflowSnapshot } from '@/renderer/features/workflow/types';
import type {
  ModelProvider,
} from '@/renderer/features/settings/model/model-providers';
import type { NetworkSettings } from '@/renderer/features/settings/model/network-settings';
import type { CodingEngineSettings } from '@/renderer/features/settings/model/coding-engine-settings';
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
  getProjectActivityPage?: (
    projectId: string,
    options?: { beforeEntryId?: string | null; limit?: number },
  ) => Promise<WorkflowProjectActivityPage>;
  getWorkflowSnapshot?: () => Promise<WorkflowSnapshot | null>;
  getAgentTranscriptPage?: (
    agentId: string,
    options?: { beforeMessageId?: string | null; limit?: number },
  ) => Promise<AgentTranscriptPage>;
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
  runIsolatedResearch?: (
    agentId: string,
    input: RunIsolatedResearchInput,
  ) => Promise<RunIsolatedResearchResult>;
  deleteModelProviderSecret?: (providerId: string) => Promise<void>;
  loadCodingEngineSettings?: () => Promise<CodingEngineSettings>;
  loadModelProviders?: () => Promise<ModelProvider[]>;
  loadNetworkSettings?: () => Promise<NetworkSettings>;
  readModelProviderSecret?: (providerId: string) => Promise<string>;
  saveCodingEngineSettings?: (settings: CodingEngineSettings) => Promise<CodingEngineSettings>;
  saveModelProviders?: (providers: ModelProvider[]) => Promise<ModelProvider[]>;
  saveNetworkSettings?: (settings: NetworkSettings) => Promise<NetworkSettings>;
  saveWorkflowSnapshot?: (snapshot: WorkflowSnapshot) => Promise<void>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  startTelegramSetupSession?: (input: StartTelegramSetupSessionInput) => Promise<string>;
  writeModelProviderSecret?: (providerId: string, value: string) => Promise<void>;
  selectProjectDirectory?: () => Promise<string | null>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
  subscribeWorkflowChanged?: (listener: () => void) => () => void;
  subscribeItemActivity?: (
    listener: (payload: { itemId: string; isWorking: boolean }) => void,
  ) => () => void;
  updateAgentChannel?: (input: UpdateAgentChannelInput) => Promise<void>;
  updateAgentDefinition?: (agentId: string, definition: AgentDefinition) => Promise<void>;
}
