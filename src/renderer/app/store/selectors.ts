// Store selector helpers.

import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import {
  presentAgent,
  presentAgentSummary,
  selectAgentById,
} from '@/renderer/features/agents/model/agent-presenters';
import type { Agent } from '@/renderer/features/agents/types';
import {
  getProjectAgents,
  getProjectItems,
  presentWorkflowEventTimestamp,
  presentWorkflowItemSummary,
  selectWorkflowItemById,
  selectWorkflowProjectById,
} from '@/renderer/features/workflow/model/workflow-presenters';
import {
  compareWorkflowProjectActivityEntries,
  createWorkflowProjectActivityEntry,
  createWorkflowProjectActivitySummary,
} from '@/shared/workflow/activity';
import type { AgentTranscriptCacheEntry } from './types';

function compareMessages(
  left: Agent['messages'][number],
  right: Agent['messages'][number],
) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.id.localeCompare(right.id);
}

function mergeAgentTranscript(agent: Agent, cacheEntry?: AgentTranscriptCacheEntry): Agent {
  if (!cacheEntry || cacheEntry.messages.length === 0) {
    return agent;
  }

  const mergedMessages = new Map([
    ...cacheEntry.messages.map((message) => [message.id, message] as const),
    ...agent.messages.map((message) => [message.id, message] as const),
  ]);
  const messages = [...mergedMessages.values()].sort(compareMessages);
  const totalMessageCount = Math.max(
    agent.transcript.totalMessageCount,
    cacheEntry.totalMessageCount,
    messages.length,
  );

  return {
    ...agent,
    messages,
    transcript: {
      ...agent.transcript,
      hasOlderMessages: messages.length < totalMessageCount,
      totalMessageCount,
    },
  };
}

/** Agent session hook. */
export function useAgentSession() {
  const {
    agentCustomizations,
    agentDrafts,
    agents,
    agentTranscriptCache,
    externalChannels,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
    telegramSetupSessions,
  } = useAppStore(
    useShallow((state) => ({
      agentCustomizations: state.agentCustomizations,
      agentDrafts: state.agentDrafts,
      agents: state.agents,
      agentTranscriptCache: state.agentTranscriptCache,
      externalChannels: state.externalChannels,
      isStreaming: state.isStreaming,
      runtimeInfo: state.runtimeInfo,
      selectedAgentId: state.selectedAgentId,
      telegramSetupSessions: state.telegramSetupSessions,
    })),
  );

  const selectedAgent = selectAgentById(
    agents,
    selectedAgentId,
  );
  const activeAgent = selectedAgent
    ? mergeAgentTranscript(selectedAgent, agentTranscriptCache[selectedAgent.id])
    : null;
  const draft = selectedAgentId ? agentDrafts[selectedAgentId] ?? '' : '';

  return {
    activeAgent: activeAgent
      ? presentAgent(activeAgent)
      : null,
    activeAgentCustomization: selectedAgentId && agentCustomizations[selectedAgentId]
      ? agentCustomizations[selectedAgentId]
      : null,
    commandAgents: agents.map((agent) => ({
      ...presentAgentSummary(agent),
      projectId: agent.projectId ?? null,
      workspace: agent.workspace,
    })),
    draft,
    externalChannels,
    isStreaming,
    runtimeInfo,
    selectedAgentId,
    telegramSetupSessions,
  };
}

/** Shell state hook. */
export function useShellState() {
  return useAppStore(
    useShallow((state) => ({
      canNavigateBack: state.navigationBackStack.length > 0,
      canNavigateForward: state.navigationForwardStack.length > 0,
      isCommandOpen: state.isCommandOpen,
      isContextPanelOpen: state.isContextPanelOpen,
      popoverAgentId: state.popoverAgentId,
      route: state.route,
    })),
  );
}

/** Workflow session hook. */
export function useWorkflowSession() {
  const {
    agents,
    isWorkflowHydrated,
    itemActivity,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      isWorkflowHydrated: state.isWorkflowHydrated,
      itemActivity: state.itemActivity,
      items: state.items,
      projects: state.projects,
      selectedItemId: state.selectedItemId,
      selectedProjectFilter: state.selectedProjectFilter,
      selectedProjectId: state.selectedProjectId,
      selectedProjectScreen: state.selectedProjectScreen,
      selectedProjectView: state.selectedProjectView,
    })),
  );
  const selectedProject = selectWorkflowProjectById(projects, selectedProjectId);
  const projectItems = getProjectItems(
    items,
    selectedProject?.id ?? selectedProjectId,
  );
  const selectedItem = selectWorkflowItemById(
    projectItems,
    selectedItemId,
  );
  const projectAgents = getProjectAgents(
    agents,
    selectedProject?.id ?? selectedProjectId,
  );
  const agentsById = new Map(agents.map((agent) => [agent.id, agent] as const));
  const projectItemsWithSummaries = projectItems.map((item) => ({
    item,
    summary: presentWorkflowItemSummary(item, projectItems, agentsById, itemActivity),
  }));
  const filteredItemSummaries = projectItemsWithSummaries.filter(({ item, summary }) => {
    switch (selectedProjectFilter) {
      case 'assigned':
        return Boolean(item.primaryAgentId);
      case 'blocked':
        return summary.hasBlockedTasks || summary.isBlockedByDependencies;
      case 'review':
        return item.status === 'review';
      default:
        return true;
    }
  }).map(({ summary }) => summary);
  const summariesById = new Map(
    projectItemsWithSummaries.map(({ summary }) => [summary.id, summary] as const),
  );
  const projectItemsByAgent = new Map(
    projectItems
      .flatMap((item) =>
        item.primaryAgentId
          ? [[item.primaryAgentId, item] as const]
          : [],
      ),
  );
  const sortedProjectItemsByUpdated = [...projectItems].sort((left, right) => right.updatedAt - left.updatedAt);
  const liveActivityEntries = projectItems
    .flatMap((item) =>
      item.workflowEvents.map((event) => createWorkflowProjectActivityEntry(item, event)),
    )
    .sort(compareWorkflowProjectActivityEntries);
  const activitySummary = createWorkflowProjectActivitySummary(projectItems);

  return {
    activityEntries: liveActivityEntries.map((entry) => ({
      ...entry,
      createdAtLabel: presentWorkflowEventTimestamp(entry.createdAt),
    })),
    activitySummary,
    filteredItemSummaries,
    isWorkflowHydrated,
    items: projectItems,
    metrics: {
      activeCount: projectItems.filter((item) => item.status === 'active').length,
      agentCount: projectAgents.length,
      blockedCount: projectItemsWithSummaries.filter(({ summary }) =>
        summary.hasBlockedTasks || summary.isBlockedByDependencies,
      ).length,
      reviewCount: projectItems.filter((item) => item.status === 'review').length,
    },
    projectAgents: projectAgents
      .map((agent) => {
        const currentItem = projectItemsByAgent.get(agent.id) ?? null;

        return {
          ...presentAgentSummary(agent),
          currentItemId: currentItem?.id ?? null,
          currentItemTitle: currentItem?.title ?? null,
          isProjectMain: agent.definition.archetype === 'project-main',
          projectId: agent.projectId ?? null,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    projects,
    recentItems: sortedProjectItemsByUpdated.slice(0, 4).map((item) => ({
      id: item.id,
      specialStateLabel: summariesById.get(item.id)?.specialStateLabel ?? null,
      title: item.title,
      updatedLabel: summariesById.get(item.id)?.updatedLabel ?? '',
    })),
    selectedItem: selectedItem
      ? {
          ...selectedItem,
          primaryAgentName: selectedItem.primaryAgentId
            ? agentsById.get(selectedItem.primaryAgentId)?.name ?? null
            : null,
          workProducts: selectedItem.workProducts.map((product) => ({
            ...product,
            createdAtLabel: presentWorkflowEventTimestamp(product.createdAt),
          })),
          workflowEvents: selectedItem.workflowEvents.map((event) => ({
            ...event,
            createdAtLabel: presentWorkflowEventTimestamp(event.createdAt),
          })),
        }
      : null,
    selectedItemId,
    selectedProject,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectScreen,
    selectedProjectView,
  };
}

/** Settings state hook. */
export function useSettingsState() {
  return useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      externalChannels: state.externalChannels,
      runtimeInfo: state.runtimeInfo,
      settingsRoute: state.settingsRoute,
      themePreference: state.themePreference,
    })),
  );
}
