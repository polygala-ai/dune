// Agent presenter helpers.

import {
  formatAgentStatus,
  formatAgentTimestamp,
  formatMessageTimestamp,
} from './time';

import type {
  Agent,
  AgentSummary,
  PresentedAgent,
} from '@/renderer/features/agents/types';

/** Presents agent summary. */
export function presentAgentSummary(
  agent: Agent,
  now: number = Date.now(),
): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    preview: agent.preview,
    updatedLabel: formatAgentTimestamp(agent.updatedAt, now),
    statusLabel: formatAgentStatus(agent.status),
  };
}

/** Presents agent. */
export function presentAgent(
  agent: Agent,
  now: number = Date.now(),
): PresentedAgent {
  return {
    ...agent,
    ...presentAgentSummary(agent, now),
    messages: agent.messages.map((message) => ({
      ...message,
      createdAtLabel: formatMessageTimestamp(message.createdAt, now),
    })),
    transcript: { ...agent.transcript },
  };
}

/** Selects agent by ID. */
export function selectAgentById(
  agents: Agent[],
  selectedAgentId: string | null,
) {
  if (!selectedAgentId) {
    return null;
  }

  return agents.find((agent) => agent.id === selectedAgentId) ?? null;
}
