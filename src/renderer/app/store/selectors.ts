// Store selector helpers.

import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import {
  presentAgent,
  presentAgentSummary,
  selectAgentById,
} from '@/renderer/features/agents/model/agent-presenters';
import {
  getProjectAgents,
  getProjectItems,
  presentWorkflowEventTimestamp,
  presentWorkflowItemSummary,
  selectWorkflowItemById,
  selectWorkflowProjectById,
} from '@/renderer/features/workflow/model/workflow-presenters';

/** Agent session hook. */
export function useAgentSession() {
  const {
    agentCustomizations,
    agentDrafts,
    agents,
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
      externalChannels: state.externalChannels,
      isStreaming: state.isStreaming,
      runtimeInfo: state.runtimeInfo,
      selectedAgentId: state.selectedAgentId,
      telegramSetupSessions: state.telegramSetupSessions,
    })),
  );

  const activeAgent = selectAgentById(
    agents,
    selectedAgentId,
  );
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
  const filteredItems = projectItems.filter((item) => {
    switch (selectedProjectFilter) {
      case 'assigned':
        return Boolean(item.primaryAgentId);
      case 'blocked':
        return item.tasks.some((task) => task.status === 'blocked');
      case 'review':
        return item.status === 'review';
      default:
        return true;
    }
  });
  const projectItemsByAgent = new Map(
    projectItems
      .flatMap((item) =>
        item.primaryAgentId
          ? [[item.primaryAgentId, item] as const]
          : [],
      ),
  );
  const sortedProjectItemsByUpdated = [...projectItems].sort((left, right) => right.updatedAt - left.updatedAt);

  return {
    activityEntries: projectItems
      .flatMap((item) =>
        item.workflowEvents.map((event) => ({
          actor: event.actor,
          createdAt: event.createdAt,
          createdAtLabel: presentWorkflowEventTimestamp(event.createdAt),
          description: event.description,
          id: event.id,
          itemId: item.id,
          itemTitle: item.title,
        })),
      )
      .sort((left, right) => right.createdAt - left.createdAt),
    filteredItemSummaries: filteredItems.map((item) =>
      presentWorkflowItemSummary(item, agentsById),
    ),
    isWorkflowHydrated,
    items: projectItems,
    metrics: {
      activeCount: projectItems.filter((item) => item.status === 'active').length,
      agentCount: projectAgents.length,
      blockedCount: projectItems.filter((item) =>
        item.tasks.some((task) => task.status === 'blocked'),
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
          isProjectMain: agent.role === 'project-main',
          projectId: agent.projectId ?? null,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    projects,
    recentItems: sortedProjectItemsByUpdated.slice(0, 4).map((item) => ({
      id: item.id,
      specialStateLabel: presentWorkflowItemSummary(item, agentsById).specialStateLabel,
      title: item.title,
      updatedLabel: presentWorkflowItemSummary(item, agentsById).updatedLabel,
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
