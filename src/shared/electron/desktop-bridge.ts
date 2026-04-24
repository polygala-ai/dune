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
import type { ProjectArtifactEntry } from '@/shared/workflow/project-artifacts';
import type { ProjectDescriptor, ProjectSettings, ProjectSettingsPatch } from '@/shared/electron/ipc-types';

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
  projectsArchive?: (projectId: string) => Promise<void>;
  projectsCreate?: (input: { description?: string; name: string }) => Promise<ProjectDescriptor>;
  projectsDelete?: (projectId: string) => Promise<void>;
  projectsGetSettings?: (projectId: string) => Promise<ProjectSettings>;
  projectsList?: () => Promise<ProjectDescriptor[]>;
  projectsSwitch?: (projectId: string) => Promise<void>;
  projectsUpdateSettings?: (projectId: string, patch: ProjectSettingsPatch) => Promise<ProjectSettings>;
  reloadExternalChannels?: () => Promise<void>;
  resetRuntime?: () => Promise<void>;
  restartApp?: () => Promise<void>;
  runIsolatedResearch?: (
    agentId: string,
    input: RunIsolatedResearchInput,
  ) => Promise<RunIsolatedResearchResult>;
  selectAgent?: (agentId: string) => Promise<void>;
  sendAgentMessage?: (agentId: string, text: string) => Promise<void>;
  startTelegramSetupSession?: (input: StartTelegramSetupSessionInput) => Promise<string>;
  storageDelete?: (store: string, key: string) => Promise<void>;
  storageGet?: (store: string, key: string) => Promise<unknown>;
  storageKeys?: (store: string) => Promise<string[]>;
  storageSet?: (store: string, key: string, value: unknown) => Promise<void>;
  selectProjectDirectory?: () => Promise<string | null>;
  subscribe?: (listener: (snapshot: AgentServiceSnapshot) => void) => () => void;
  subscribeWorkflowChanged?: (listener: () => void) => () => void;
  subscribeItemActivity?: (
    listener: (payload: { itemId: string; isWorking: boolean }) => void,
  ) => () => void;
  updateAgentChannel?: (input: UpdateAgentChannelInput) => Promise<void>;
  updateAgentDefinition?: (agentId: string, definition: AgentDefinition) => Promise<void>;
}
