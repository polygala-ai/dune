// Agent slice store logic.

import type { AgentServiceSnapshot } from '@/shared/agents/agent-runtime';
import { cloneAgentCustomizationDraft } from '@/renderer/features/agents/model/agent-customization';
import type {
  AgentTranscriptCacheEntry,
  AgentState,
  AppStoreSlice,
  AgentSlice,
} from './types';

function compareMessages(
  left: AgentTranscriptCacheEntry['messages'][number],
  right: AgentTranscriptCacheEntry['messages'][number],
) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.id.localeCompare(right.id);
}

function mergeTranscriptMessages(
  messages: AgentTranscriptCacheEntry['messages'],
) {
  const deduped = new Map(messages.map((message) => [message.id, message] as const));

  return [...deduped.values()].sort(compareMessages);
}

/** Creates initial agent state. */
export function createInitialAgentState(snapshot: AgentServiceSnapshot): AgentState {
  return {
    agents: snapshot.agents,
    agentCustomizations: {},
    agentDrafts: {},
    agentTranscriptCache: {},
    codingEngines: snapshot.codingEngines,
    externalChannels: snapshot.externalChannels,
    isStreaming: snapshot.isStreaming,
    runtimeInfo: snapshot.runtimeInfo,
    selectedAgentId: snapshot.selectedAgentId,
    telegramSetupSessions: snapshot.telegramSetupSessions,
  };
}

/** Creates agent slice. */
export function createAgentSlice(initialState: AgentState): AppStoreSlice<AgentSlice> {
  return (set) => ({
    ...initialState,
    appendTranscriptPage: (page) => {
      set((state) => {
        const agent = state.agents.find((candidate) => candidate.id === page.agentId);

        if (!agent) {
          return {};
        }

        const existingEntry = state.agentTranscriptCache[page.agentId];
        const nextMessages = mergeTranscriptMessages([
          ...page.messages,
          ...(existingEntry?.messages ?? []),
        ]);

        return {
          agentTranscriptCache: {
            ...state.agentTranscriptCache,
            [page.agentId]: {
              messages: nextMessages,
              totalMessageCount: Math.max(
                page.totalMessageCount,
                existingEntry?.totalMessageCount ?? 0,
              ),
            },
          },
        };
      });
    },
    setAgentsSnapshot: ({
      agents,
      codingEngines,
      externalChannels,
      isStreaming,
      runtimeInfo,
      selectedAgentId,
      telegramSetupSessions,
    }) => {
      set((state) => {
        const nextAgentIds = new Set(agents.map((agent) => agent.id));
        const nextAgentCustomizations = Object.fromEntries(
          Object.entries(state.agentCustomizations).filter(([agentId]) => nextAgentIds.has(agentId)),
        );
        const nextAgentDrafts = Object.fromEntries(
          Object.entries(state.agentDrafts).filter(([agentId]) => nextAgentIds.has(agentId)),
        );
        const previousAgentsById = new Map(state.agents.map((agent) => [agent.id, agent] as const));
        const nextAgentTranscriptCache = Object.fromEntries(
          Object.entries(state.agentTranscriptCache)
            .filter(([agentId]) => nextAgentIds.has(agentId))
            .map(([agentId, entry]) => {
              const previousAgent = previousAgentsById.get(agentId);
              const nextAgent = agents.find((candidate) => candidate.id === agentId);
              const nextLiveMessageIds = new Set(nextAgent?.messages.map((message) => message.id) ?? []);
              const compactedLiveMessages = previousAgent?.messages.filter((message) =>
                !nextLiveMessageIds.has(message.id),
              ) ?? [];
              const messages = mergeTranscriptMessages([
                ...(entry?.messages ?? []),
                ...compactedLiveMessages,
              ]);

              return [agentId, {
                messages,
                totalMessageCount: Math.max(
                  entry?.totalMessageCount ?? 0,
                  nextAgent?.transcript.totalMessageCount ?? nextAgent?.messages.length ?? 0,
                ),
              } satisfies AgentTranscriptCacheEntry];
            }),
        );

        return {
          agentCustomizations: nextAgentCustomizations,
          agentDrafts: nextAgentDrafts,
          agentTranscriptCache: nextAgentTranscriptCache,
          agents,
          codingEngines,
          externalChannels,
          isStreaming,
          runtimeInfo,
          selectedAgentId,
          telegramSetupSessions,
        };
      });
    },
    setDraft: (agentId, draft) => {
      if (!agentId) {
        return;
      }

      set((state) => {
        if (!state.agents.some((agent) => agent.id === agentId)) {
          return {};
        }

        const nextAgentDrafts = { ...state.agentDrafts };

        if (draft) {
          nextAgentDrafts[agentId] = draft;
        } else {
          delete nextAgentDrafts[agentId];
        }

        return { agentDrafts: nextAgentDrafts };
      });
    },
    upsertAgentCustomization: (agentId, customization) => {
      if (!agentId) {
        return;
      }

      set((state) => {
        return {
          agentCustomizations: {
            ...state.agentCustomizations,
            [agentId]: cloneAgentCustomizationDraft(customization),
          },
        };
      });
    },
    resetAgentCustomization: (agentId) => {
      if (!agentId) {
        return;
      }

      set((state) => {
        if (!state.agentCustomizations[agentId]) {
          return {};
        }

        const nextAgentCustomizations = { ...state.agentCustomizations };
        delete nextAgentCustomizations[agentId];

        return {
          agentCustomizations: nextAgentCustomizations,
        };
      });
    },
  });
}
