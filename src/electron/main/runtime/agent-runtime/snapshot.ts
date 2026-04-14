// Agent runtime snapshot builders.

import type { AgentRuntimeInfo } from '@/renderer/features/agents/types';
import {
  cloneExternalChannelsState,
  cloneTelegramAgentRuntimeState,
  cloneTelegramSetupSession,
} from '@/renderer/features/agents/model/channels';
import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';

import { resolveArtifactsDir } from '../artifacts';

/** Clones snapshot. */
export function cloneSnapshot(snapshot: AgentServiceSnapshot): AgentServiceSnapshot {
  return {
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      activityEvents: agent.activityEvents.map((event) => ({ ...event })),
      channel: {
        ...agent.channel,
        target: agent.channel.target ? { ...agent.channel.target } : null,
      },
      codingEngineEvents: agent.codingEngineEvents.map((event) => ({ ...event })),
      contextCards: agent.contextCards.map((card) => ({ ...card })),
      messages: agent.messages.map((message) => ({
        ...message,
        attachments: message.attachments.map((attachment) => ({ ...attachment })),
      })),
      projectId: agent.projectId ?? null,
      role: agent.role,
      telegram: cloneTelegramAgentRuntimeState(agent.telegram),
    })),
    codingEngines: snapshot.codingEngines.map((engine) => ({ ...engine })),
    externalChannels: cloneExternalChannelsState(snapshot.externalChannels),
    isStreaming: snapshot.isStreaming,
    runtimeInfo: { ...snapshot.runtimeInfo },
    selectedAgentId: snapshot.selectedAgentId,
    telegramSetupSessions: snapshot.telegramSetupSessions.map(cloneTelegramSetupSession),
  };
}

/** Creates runtime ready message. */
export function createRuntimeReadyMessage(credentials: Record<string, string>): string {
  return Object.keys(credentials).length > 0
    ? 'AgentLite is running with saved model credentials.'
    : 'AgentLite is running without saved model credentials; replies will fail.';
}

/** Creates runtime info. */
export function createRuntimeInfo(
  runtimeRoot: string,
  homeDir: string,
  overrides: Partial<AgentRuntimeInfo> = {},
): AgentRuntimeInfo {
  return {
    artifactsPath: resolveArtifactsDir(homeDir),
    mode: 'real',
    rootPath: runtimeRoot,
    status: 'starting',
    ...overrides,
  };
}
