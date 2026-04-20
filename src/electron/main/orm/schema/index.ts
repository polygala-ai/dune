// Public ORM schema surface.

export * from './agents';
export * from './compatibility';
export * from './constants';
export * from './settings';
export * from './workflow';

import {
  agentActivityEvents,
  agentCodingEngineEvents,
  agentContextCards,
  agentMessages,
  agentTranscriptArchives,
  agents,
  agentUiState,
  codingEngines,
  runtimeState,
  telegramSetupSessions,
} from './agents';
import {
  agentStateSnapshots,
  workflowSnapshots,
} from './compatibility';
import {
  modelProviders,
  networkSettings,
  secretEntries,
} from './settings';
import {
  workflowEvents,
  workflowItemActivityArchives,
  workflowItems,
  workflowProjects,
  workflowTasks,
  workflowUiState,
  workflowWorkProducts,
} from './workflow';

/** Shared export for schema-aware Drizzle clients. */
export const duneSchema = {
  agentActivityEvents,
  agentCodingEngineEvents,
  agentContextCards,
  agentMessages,
  agentStateSnapshots,
  agents,
  agentTranscriptArchives,
  agentUiState,
  codingEngines,
  modelProviders,
  networkSettings,
  runtimeState,
  secretEntries,
  telegramSetupSessions,
  workflowEvents,
  workflowItemActivityArchives,
  workflowItems,
  workflowProjects,
  workflowSnapshots,
  workflowTasks,
  workflowUiState,
  workflowWorkProducts,
} as const;
