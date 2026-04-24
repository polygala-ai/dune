// Workflow persistence hook.

import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { createEmptyWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import {
  workflowItemStatuses,
  type ItemPriority,
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
import { createWorkflowItemActivitySummary } from '@/shared/workflow/activity';
import { isPlainObject } from '@/shared/is-record';

const STORE_NAME = 'workflow';
const STORE_KEY = 'snapshot';
const workflowItemPriorities = ['critical', 'high', 'medium', 'low'] as const;

/** Normalizes task. */
function normalizeTask(value: unknown): WorkflowTask | null {
  if (!isPlainObject(value)) {
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

/** Normalizes work product. */
function normalizeWorkProduct(value: unknown): WorkflowWorkProduct | null {
  if (!isPlainObject(value)) {
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

/** Normalizes event. */
function normalizeEvent(value: unknown): WorkflowEvent | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }

  const kind =
    value.kind === 'assignment' ||
    value.kind === 'feedback' ||
    value.kind === 'item.priority_changed' ||
    value.kind === 'item.sla_breached' ||
    value.kind === 'item.sla_cleared' ||
    value.kind === 'item.sla_set' ||
    value.kind === 'item.sla_warning' ||
    value.kind === 'note' ||
    value.kind === 'task'
      ? value.kind
      : 'item';

  return {
    ...(typeof value.actor === 'string' && value.actor.trim()
      ? { actor: value.actor }
      : {}),
    createdAt: value.createdAt,
    description: value.description,
    id: value.id,
    kind,
  };
}

/** Normalizes current snapshot. */
function normalizeCurrentSnapshot(value: unknown): WorkflowSnapshot | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (!Array.isArray(value.projects) || !Array.isArray(value.items)) {
    return null;
  }

  const projects = value.projects.flatMap((project) => {
    if (
      !isPlainObject(project) ||
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
      !isPlainObject(item) ||
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
    const activity = isPlainObject(item.activity)
      ? createWorkflowItemActivitySummary({
          ...(
            typeof item.activity.archivedEventCount === 'number'
              ? { archivedEventCount: item.activity.archivedEventCount }
              : {}
          ),
          ...(
            typeof item.activity.hasOlderEvents === 'boolean'
              ? { hasOlderEvents: item.activity.hasOlderEvents }
              : {}
          ),
          ...(
            typeof item.activity.rollingSummary === 'string' || item.activity.rollingSummary === null
              ? { rollingSummary: item.activity.rollingSummary }
              : {}
          ),
          totalEventCount:
            typeof item.activity.totalEventCount === 'number'
              ? item.activity.totalEventCount
              : workflowEvents.length,
        })
      : createWorkflowItemActivitySummary({
          totalEventCount: workflowEvents.length,
        });
    const priority = workflowItemPriorities.includes(item.priority as ItemPriority)
      ? (item.priority as ItemPriority)
      : 'medium';
    const slaDeadlineMs = typeof item.slaDeadlineMs === 'number' ? item.slaDeadlineMs : undefined;

    return [{
      activity,
      artifactFolderName:
        typeof item.artifactFolderName === 'string' && item.artifactFolderName.trim()
          ? item.artifactFolderName.trim()
          : createArtifactFolderName(item.title, item.id),
      brief: item.brief,
      createdAt: item.createdAt,
      id: item.id,
      priority,
      primaryAgentId:
        typeof item.primaryAgentId === 'string' || item.primaryAgentId === null
          ? item.primaryAgentId
          : null,
      projectId: item.projectId,
      scheduledTaskId:
        typeof item.scheduledTaskId === 'string' ? item.scheduledTaskId : null,
      ...(typeof item.slaBreachedAt === 'number' && slaDeadlineMs !== undefined
        ? { slaBreachedAt: item.slaBreachedAt }
        : {}),
      ...(slaDeadlineMs !== undefined ? { slaDeadlineMs } : {}),
      ...(typeof item.slaWarnedAt === 'number' && slaDeadlineMs !== undefined
        ? { slaWarnedAt: item.slaWarnedAt }
        : {}),
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

/** Normalizes workflow snapshot. */
function normalizeWorkflowSnapshot(value: unknown): WorkflowSnapshot | null {
  return normalizeCurrentSnapshot(value);
}

/** Workflow persistence hook. */
export function useWorkflowPersistence() {
  const hydrateWorkflow = useAppStore((state) => state.hydrateWorkflow);
  const setItemActivity = useAppStore((state) => state.setItemActivity);
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

    /** Loads . */
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

    const unsubscribeActivity = window.duneDesktop?.subscribeItemActivity?.((payload) => {
      setItemActivity(payload.itemId, { isWorking: payload.isWorking });
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
      unsubscribeActivity?.();
    };
  }, [hydrateWorkflow, setItemActivity]);

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
