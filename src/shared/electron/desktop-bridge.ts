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

/** Budget config shape. */
export interface BudgetConfig {
  daily_limit_usd: number | null;
  total_limit_usd: number | null;
  reset_hour: number;
}

/** Budget state shape. */
export interface BudgetState {
  paused: boolean;
  paused_at: number | null;
  paused_reason: string | null;
}

/** Budget usage shape. */
export interface BudgetUsage {
  daily_cost_usd: number;
  total_cost_usd: number;
  daily_pct: number | null;
  total_pct: number | null;
}

/** Budget result shape from AgentLite budget_get action. */
export interface BudgetResult {
  config: BudgetConfig;
  state: BudgetState;
  usage: BudgetUsage;
}

/** Budget exceeded event payload. */
export interface BudgetExceededPayload {
  agentId: string;
  jid: string;
  limitType: 'daily' | 'total';
  limitUsd: number;
  usedUsd: number;
  timestamp: string;
}

/** Budget warning event payload. */
export interface BudgetWarningPayload {
  agentId: string;
  jid: string;
  pctUsed: number;
  limitType: 'daily' | 'total';
  limitUsd: number;
  usedUsd: number;
  timestamp: string;
}

/** Methods are optional to support browser-only fallback (no Electron preload). */
export interface DesktopBridge {
  applyNetworkSettings?: () => Promise<void>;
  getBudget?: (agentId: string) => Promise<BudgetResult | null>;
  setBudget?: (agentId: string, config: Partial<BudgetConfig>) => Promise<void>;
  resumeBudget?: (agentId: string) => Promise<void>;
  subscribeBudgetExceeded?: (listener: (payload: BudgetExceededPayload) => void) => () => void;
  subscribeBudgetWarning?: (listener: (payload: BudgetWarningPayload) => void) => () => void;
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
