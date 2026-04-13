import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { createEmptyWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import {
  workflowItemStatuses,
  workflowProjectFilters,
  workflowProjectViews,
  workflowTaskStatuses,
  type WorkflowEvent,
  type WorkflowSnapshot,
  type WorkflowTask,
  type WorkflowWorkProduct,
} from '@/renderer/features/workflow/types';
import {
  createArtifactFolderName,
  normalizeProjectRootPath,
} from '@/shared/workflow/project-artifacts';

const STORE_NAME = 'workflow';
const STORE_KEY = 'snapshot';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTask(value: unknown): WorkflowTask | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.notes !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number' ||
    !workflowTaskStatuses.includes(value.status as (typeof workflowTaskStatuses)[number])
  ) {
    return null;
  }

  return {
    createdAt: value.createdAt,
    id: value.id,
    notes: value.notes,
    status: value.status as WorkflowTask['status'],
    title: value.title,
    updatedAt: value.updatedAt,
  };
}

function normalizeWorkProduct(value: unknown): WorkflowWorkProduct | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    body: value.body,
    createdAt: value.createdAt,
    id: value.id,
    title: value.title,
  };
}

function normalizeEvent(value: unknown): WorkflowEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }

  const kind = value.kind === 'assignment'
    ? 'assignment'
    : value.kind === 'task'
      ? 'task'
      : value.kind === 'note'
        ? 'note'
        : 'item';

  return {
    createdAt: value.createdAt,
    description: value.description,
    id: value.id,
    kind,
  };
}

function normalizeCurrentSnapshot(value: unknown): WorkflowSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.projects) || !Array.isArray(value.items)) {
    return null;
  }

  const projects = value.projects.flatMap((project) => {
    if (
      !isRecord(project) ||
      typeof project.id !== 'string' ||
      typeof project.name !== 'string' ||
      typeof project.description !== 'string' ||
      typeof project.color !== 'string' ||
      typeof project.createdAt !== 'number' ||
      typeof project.updatedAt !== 'number' ||
      (
        project.rootPath !== undefined &&
        project.rootPath !== null &&
        typeof project.rootPath !== 'string'
      )
    ) {
      return [];
    }

    return [{
      color: project.color,
      createdAt: project.createdAt,
      description: project.description,
      id: project.id,
      name: project.name,
      rootPath: normalizeProjectRootPath(project.rootPath),
      updatedAt: project.updatedAt,
    }];
  });

  const projectIds = new Set(projects.map((project) => project.id));
  const items = value.items.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.projectId !== 'string' ||
      !projectIds.has(item.projectId) ||
      typeof item.title !== 'string' ||
      typeof item.brief !== 'string' ||
      typeof item.sortOrder !== 'number' ||
      typeof item.createdAt !== 'number' ||
      typeof item.updatedAt !== 'number' ||
      !Array.isArray(item.tasks) ||
      !Array.isArray(item.workProducts) ||
      !Array.isArray(item.workflowEvents)
    ) {
      return [];
    }

    const tasks = item.tasks.flatMap((task) => {
      const normalized = normalizeTask(task);
      return normalized ? [normalized] : [];
    });
    const workProducts = item.workProducts.flatMap((product) => {
      const normalized = normalizeWorkProduct(product);
      return normalized ? [normalized] : [];
    });
    const workflowEvents = item.workflowEvents.flatMap((event) => {
      const normalized = normalizeEvent(event);
      return normalized ? [normalized] : [];
    });

    return [{
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : createArtifactFolderName(item.title, item.id),
      brief: item.brief,
      createdAt: item.createdAt,
      id: item.id,
      primaryAgentId:
        typeof item.primaryAgentId === 'string' || item.primaryAgentId === null
          ? item.primaryAgentId
          : null,
      projectId: item.projectId,
      sortOrder: item.sortOrder,
      status: workflowItemStatuses.includes(item.status as (typeof workflowItemStatuses)[number])
        ? (item.status as WorkflowSnapshot['items'][number]['status'])
        : 'inbox',
      tasks,
      title: item.title,
      updatedAt: item.updatedAt,
      workProducts,
      workflowEvents,
    }];
  });

  const itemIds = new Set(items.map((item) => item.id));
  const selectedItemId =
    typeof value.selectedItemId === 'string' && itemIds.has(value.selectedItemId)
      ? value.selectedItemId
      : null;
  const selectedProjectId =
    typeof value.selectedProjectId === 'string' && projectIds.has(value.selectedProjectId)
      ? value.selectedProjectId
      : null;

  return {
    items,
    projects,
    selectedItemId,
    selectedProjectFilter: workflowProjectFilters.includes(
      value.selectedProjectFilter as (typeof workflowProjectFilters)[number],
    )
      ? (value.selectedProjectFilter as WorkflowSnapshot['selectedProjectFilter'])
      : 'all',
    selectedProjectId,
    selectedProjectView: workflowProjectViews.includes(
      value.selectedProjectView as (typeof workflowProjectViews)[number],
    )
      ? (value.selectedProjectView as WorkflowSnapshot['selectedProjectView'])
      : 'board',
  };
}

function migrateLegacySnapshot(value: unknown): WorkflowSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.projects) || !Array.isArray(value.missions)) {
    return null;
  }

  const projects = value.projects.map((project) => {
    if (
      !isRecord(project) ||
      typeof project.id !== 'string' ||
      typeof project.name !== 'string' ||
      typeof project.description !== 'string' ||
      typeof project.color !== 'string' ||
      typeof project.createdAt !== 'number' ||
      typeof project.updatedAt !== 'number'
    ) {
      return null;
    }

    return {
      color: project.color,
      createdAt: project.createdAt,
      description: project.description,
      id: project.id,
      name: project.name,
      rootPath: null,
      updatedAt: project.updatedAt,
    };
  });

  if (projects.some((project) => project === null)) {
    return null;
  }

  const items = value.missions.flatMap((mission) => {
    if (
      !isRecord(mission) ||
      typeof mission.id !== 'string' ||
      typeof mission.projectId !== 'string' ||
      typeof mission.title !== 'string' ||
      typeof mission.brief !== 'string' ||
      typeof mission.sortOrder !== 'number' ||
      typeof mission.createdAt !== 'number' ||
      typeof mission.updatedAt !== 'number' ||
      !Array.isArray(mission.tasks) ||
      !Array.isArray(mission.workProducts) ||
      !Array.isArray(mission.workflowEvents)
    ) {
      return [];
    }

    const tasks = mission.tasks.map(normalizeTask);
    const workProducts = mission.workProducts.map(normalizeWorkProduct);
    const workflowEvents = mission.workflowEvents.map((event) => {
      const normalized = normalizeEvent(event);

      if (!normalized) {
        return null;
      }

      return {
        ...normalized,
        kind: normalized.kind === 'item'
          ? 'item'
          : normalized.kind === 'assignment'
            ? 'assignment'
            : normalized.kind,
      };
    });

    if (
      tasks.some((task) => task === null) ||
      workProducts.some((product) => product === null) ||
      workflowEvents.some((event) => event === null)
    ) {
      return [];
    }

    const linkedAgents = Array.isArray(mission.linkedAgents)
      ? mission.linkedAgents.filter(isRecord)
      : [];
    const primaryAgentId = linkedAgents.find(
      (agent): agent is Record<string, string> => typeof agent.agentId === 'string',
    )?.agentId ?? null;
    const legacyStatus = mission.status === 'planned' ? 'ready' : mission.status;

    if (!workflowItemStatuses.includes(legacyStatus as (typeof workflowItemStatuses)[number])) {
      return [];
    }

    return [{
      artifactFolderName: createArtifactFolderName(mission.title, mission.id),
      brief: mission.brief,
      createdAt: mission.createdAt,
      id: mission.id,
      primaryAgentId,
      projectId: mission.projectId,
      sortOrder: mission.sortOrder,
      status: legacyStatus as WorkflowSnapshot['items'][number]['status'],
      tasks: tasks as WorkflowTask[],
      title: mission.title,
      updatedAt: mission.updatedAt,
      workProducts: workProducts as WorkflowWorkProduct[],
      workflowEvents: workflowEvents as WorkflowEvent[],
    }];
  });

  return {
    items,
    projects: projects as WorkflowSnapshot['projects'],
    selectedItemId:
      typeof value.selectedMissionId === 'string' || value.selectedMissionId === null
        ? value.selectedMissionId
        : null,
    selectedProjectFilter: 'all',
    selectedProjectId:
      typeof value.selectedProjectId === 'string' || value.selectedProjectId === null
        ? value.selectedProjectId
        : null,
    selectedProjectView: 'board',
  };
}

function normalizeWorkflowSnapshot(value: unknown): WorkflowSnapshot | null {
  return normalizeCurrentSnapshot(value) ?? migrateLegacySnapshot(value);
}

export function useWorkflowPersistence() {
  const hydrateWorkflow = useAppStore((state) => state.hydrateWorkflow);
  const {
    isWorkflowHydrated,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectView,
  } = useAppStore(
    useShallow((state) => ({
      isWorkflowHydrated: state.isWorkflowHydrated,
      items: state.items,
      projects: state.projects,
      selectedItemId: state.selectedItemId,
      selectedProjectFilter: state.selectedProjectFilter,
      selectedProjectId: state.selectedProjectId,
      selectedProjectView: state.selectedProjectView,
    })),
  );

  useEffect(() => {
    let isDisposed = false;

    const load = async () => {
      const rawSnapshot = await window.duneDesktop?.storageGet?.(STORE_NAME, STORE_KEY);
      const normalizedSnapshot = normalizeWorkflowSnapshot(rawSnapshot);
      const snapshot = normalizedSnapshot ?? createEmptyWorkflowSnapshot();

      if (isDisposed) {
        return;
      }

      hydrateWorkflow(snapshot);

      if (!normalizedSnapshot) {
        await window.duneDesktop?.storageSet?.(STORE_NAME, STORE_KEY, snapshot);
      }
    };

    void load();

    const unsubscribe = window.duneDesktop?.subscribeWorkflowChanged?.(() => {
      void load();
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [hydrateWorkflow]);

  useEffect(() => {
    if (!isWorkflowHydrated) {
      return;
    }

    void window.duneDesktop?.storageSet?.(STORE_NAME, STORE_KEY, {
      items,
      projects,
      selectedItemId,
      selectedProjectFilter,
      selectedProjectId,
      selectedProjectView,
    } satisfies WorkflowSnapshot);
  }, [
    isWorkflowHydrated,
    items,
    projects,
    selectedItemId,
    selectedProjectFilter,
    selectedProjectId,
    selectedProjectView,
  ]);
}
