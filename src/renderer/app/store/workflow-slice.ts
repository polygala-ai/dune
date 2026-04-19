// Workflow store slice state and reducers.

import type { AppStoreSlice } from '@/renderer/app/store/types';
import type {
  WorkflowActions,
  WorkflowSlice,
  WorkflowState,
} from '@/renderer/app/store/types';
import {
  getProjectItems,
  getWorkflowSnapshotState,
} from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowEventKind,
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProjectFilter,
  WorkflowProjectView,
  WorkflowSnapshot,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';

import { createId, createProjectId } from '@/shared/id';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import {
  createArtifactFolderName,
  normalizeProjectRootPath,
} from '@/shared/workflow/project-artifacts';

const defaultProjectColors = ['#A86D46', '#7A8B5D', '#4F7A78', '#9D6A71', '#6C69A6'] as const;

/** Creates item event. */
function createItemEvent(
  kind: WorkflowEventKind,
  description: string,
  createdAt: number,
) {
  return {
    actor: 'You',
    createdAt,
    description,
    id: createId('event'),
    kind,
  };
}

/** Sorts items by project status. */
function sortItemsByProjectStatus(items: WorkflowItem[]) {
  const nextItems = items.map((item) => ({
    ...item,
    tasks: item.tasks.map((task) => ({ ...task })),
    workProducts: item.workProducts.map((product) => ({ ...product })),
    workflowEvents: item.workflowEvents.map((event) => ({ ...event })),
  }));
  const grouped = new Map<string, WorkflowItem[]>();

  for (const item of nextItems) {
    const key = `${item.projectId}:${item.status}`;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }

  for (const group of grouped.values()) {
    group
      .sort((left, right) =>
        left.sortOrder === right.sortOrder
          ? left.updatedAt - right.updatedAt
          : left.sortOrder - right.sortOrder,
      )
      .forEach((item, index) => {
        item.sortOrder = index;
      });
  }

  return nextItems;
}

/** Ensures selection. */
function ensureSelection(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  const selectedProjectId =
    snapshot.selectedProjectId &&
    snapshot.projects.some((project) => project.id === snapshot.selectedProjectId)
      ? snapshot.selectedProjectId
      : snapshot.projects[0]?.id ?? null;
  const projectItems = getProjectItems(snapshot.items, selectedProjectId);
  const selectedItemId =
    snapshot.selectedItemId &&
    projectItems.some((item) => item.id === snapshot.selectedItemId)
      ? snapshot.selectedItemId
      : null;

  return {
    ...snapshot,
    selectedItemId,
    selectedProjectFilter: snapshot.selectedProjectFilter ?? 'all',
    selectedProjectId,
    selectedProjectView: snapshot.selectedProjectView ?? 'board',
  };
}

/** Appends item event. */
function appendItemEvent(
  item: WorkflowItem,
  kind: WorkflowEventKind,
  description: string,
  updatedAt: number,
) {
  return {
    ...item,
    updatedAt,
    workflowEvents: [
      createItemEvent(kind, description, updatedAt),
      ...item.workflowEvents,
    ],
  };
}

/** Wraps selection. */
function withSelection(
  state: Pick<
    WorkflowState,
    | 'items'
    | 'projects'
    | 'selectedItemId'
    | 'selectedProjectFilter'
    | 'selectedProjectId'
    | 'selectedProjectView'
  >,
) {
  return ensureSelection({
    items: sortItemsByProjectStatus(state.items),
    projects: state.projects,
    selectedItemId: state.selectedItemId,
    selectedProjectFilter: state.selectedProjectFilter,
    selectedProjectId: state.selectedProjectId,
    selectedProjectView: state.selectedProjectView,
  });
}

/** Touches project. */
function touchProject(
  projects: WorkflowState['projects'],
  projectId: string,
  updatedAt: number,
) {
  return touchProjects(projects, [projectId], updatedAt);
}

/** Touches projects. */
function touchProjects(
  projects: WorkflowState['projects'],
  projectIds: Iterable<string>,
  updatedAt: number,
) {
  const ids = new Set(projectIds);

  if (ids.size === 0) {
    return projects;
  }

  return projects.map((project) =>
    ids.has(project.id)
      ? {
          ...project,
          updatedAt,
        }
      : project,
  );
}

/** Describes item status. */
function describeItemStatus(status: WorkflowItemStatus) {
  switch (status) {
    case 'inbox':
      return 'Inbox';
    case 'ready':
      return 'Ready';
    case 'active':
      return 'Active';
    case 'review':
      return 'Review';
    case 'done':
      return 'Done';
  }
}

/** Items exists. */
function itemExists(items: WorkflowItem[], itemId: string) {
  return items.some((item) => item.id === itemId);
}

/** Returns next project color. */
function getNextProjectColor(projectCount: number) {
  return defaultProjectColors[projectCount % defaultProjectColors.length] ?? '#A86D46';
}

/** Creates initial workflow state. */
export function createInitialWorkflowState(): WorkflowState {
  return {
    isWorkflowHydrated: false,
    itemActivity: {},
    items: [],
    projects: [],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: null,
    selectedProjectScreen: 'main',
    selectedProjectView: 'board',
  };
}

/** Creates workflow slice. */
export function createWorkflowSlice(
  initialState: WorkflowState,
): AppStoreSlice<WorkflowSlice> {
  return (set) => {
    const actions: WorkflowActions = {
      addTask: (itemId, title) => {
        const trimmedTitle = title.trim();

        if (!trimmedTitle) {
          return null;
        }

        const taskId = createId('task');
        const updatedAt = Date.now();

        set((state) => {
          const targetItem = state.items.find((item) => item.id === itemId);

          if (!targetItem) {
            return state;
          }

          const nextItems = state.items.map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            return appendItemEvent(
              {
                ...item,
                tasks: [
                  ...item.tasks,
                  {
                    createdAt: updatedAt,
                    id: taskId,
                    notes: '',
                    status: 'todo',
                    title: trimmedTitle,
                    updatedAt,
                  },
                ],
              },
              'task',
              `Added checklist item “${trimmedTitle}”.`,
              updatedAt,
            );
          });

          return {
            ...withSelection({
              items: nextItems,
              projects: touchProject(state.projects, targetItem.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: targetItem.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });

        return taskId;
      },
      addWorkProduct: (itemId, input) => {
        const title = input.title.trim();
        const body = input.body.trim();

        if (!title || !body) {
          return null;
        }

        const productId = createId('work-product');
        const updatedAt = Date.now();

        set((state) => {
          const targetItem = state.items.find((item) => item.id === itemId);

          if (!targetItem) {
            return state;
          }

          return {
            ...withSelection({
              items: state.items.map((item) => {
                if (item.id !== itemId) {
                  return item;
                }

                return appendItemEvent(
                  {
                    ...item,
                    workProducts: [
                      {
                        body,
                        createdAt: updatedAt,
                        id: productId,
                        title,
                      },
                      ...item.workProducts,
                    ],
                  },
                  'note',
                  `Added output “${title}”.`,
                  updatedAt,
                );
              }),
              projects: touchProject(state.projects, targetItem.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: targetItem.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });

        return productId;
      },
      assignPrimaryAgent: (itemId, input) => {
        const updatedAt = Date.now();
        const clearedDescription = 'Primary agent cleared.';

        set((state) => {
          const targetItem = state.items.find((item) => item.id === itemId);

          if (!targetItem) {
            return state;
          }

          const nextDescription = input.agentId
            ? `Primary agent set to “${input.agentName?.trim() || 'Assigned agent'}”.`
            : clearedDescription;
          const touchedProjectIds = new Set<string>([targetItem.projectId]);

          return {
            ...withSelection({
              items: state.items.map((item) => {
                if (item.id === itemId) {
                  return appendItemEvent(
                    {
                      ...item,
                      primaryAgentId: input.agentId,
                    },
                    'assignment',
                    nextDescription,
                    updatedAt,
                  );
                }

                if (!input.agentId || item.primaryAgentId !== input.agentId) {
                  return item;
                }

                touchedProjectIds.add(item.projectId);
                return appendItemEvent(
                  {
                    ...item,
                    primaryAgentId: null,
                  },
                  'assignment',
                  clearedDescription,
                  updatedAt,
                );
              }),
              projects: touchProjects(state.projects, touchedProjectIds, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: targetItem.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });
      },
      clearAgentAssignments: (agentId) => {
        const updatedAt = Date.now();
        const clearedDescription = 'Primary agent cleared.';

        set((state) => {
          const touchedProjectIds = new Set<string>();
          let didClearAssignments = false;

          const nextItems = state.items.map((item) => {
            if (item.primaryAgentId !== agentId) {
              return item;
            }

            didClearAssignments = true;
            touchedProjectIds.add(item.projectId);

            return appendItemEvent(
              {
                ...item,
                primaryAgentId: null,
              },
              'assignment',
              clearedDescription,
              updatedAt,
            );
          });

          if (!didClearAssignments) {
            return state;
          }

          return {
            ...withSelection({
              items: nextItems,
              projects: touchProjects(state.projects, touchedProjectIds, updatedAt),
              selectedItemId: state.selectedItemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: state.selectedProjectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });
      },
      createItem: (input) => {
        const title = input.title.trim();
        const brief = input.brief.trim();

        if (!title) {
          return null;
        }

        const itemId = createId('item');
        const artifactFolderName = createArtifactFolderName(title, itemId);
        const updatedAt = Date.now();

        set((state) => {
          const nextItem: WorkflowItem = {
            artifactFolderName,
            brief,
            createdAt: updatedAt,
            id: itemId,
            primaryAgentId: null,
            projectId: input.projectId,
            scheduledTaskId: null,
            sortOrder: getProjectItems(
              state.items.filter((item) => item.status === input.status),
              input.projectId,
            ).length,
            status: input.status,
            tasks: createDefaultTasks(updatedAt),
            title,
            updatedAt,
            workProducts: [],
            workflowEvents: [
              createItemEvent('item', `Work item “${title}” was created.`, updatedAt),
            ],
          };

          return {
            ...withSelection({
              items: [...state.items, nextItem],
              projects: touchProject(state.projects, input.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: input.projectId,
              selectedProjectView: 'board',
            }),
          };
        });

        return itemId;
      },
      createProject: (input) => {
        const name = input.name.trim();

        if (!name) {
          return null;
        }

        const projectId = createProjectId();
        const updatedAt = Date.now();
        const rootPath = normalizeProjectRootPath(input.rootPath);

        set((state) => ({
          ...withSelection({
            items: state.items,
            projects: [
              ...state.projects,
              {
                color: getNextProjectColor(state.projects.length),
                createdAt: updatedAt,
                description: input.description.trim(),
                id: projectId,
                name,
                rootPath,
                updatedAt,
              },
            ],
            selectedItemId: state.selectedItemId,
            selectedProjectFilter: 'all',
            selectedProjectId: projectId,
            selectedProjectView: 'board',
          }),
          selectedProjectScreen: 'main',
        }));

        return projectId;
      },
      deleteProject: (projectId) => {
        set((state) => {
          if (!state.projects.some((project) => project.id === projectId)) {
            return state;
          }

          const deletedAgentIds = state.agents
            .filter((agent) => agent.projectId === projectId)
            .map((agent) => agent.id);
          const isDeletedAgentSelected =
            state.selectedAgentId !== null &&
            deletedAgentIds.includes(state.selectedAgentId);
          const nextSelection = withSelection({
            items: state.items.filter((item) => item.projectId !== projectId),
            projects: state.projects.filter((project) => project.id !== projectId),
            selectedItemId: state.selectedItemId,
            selectedProjectFilter: state.selectedProjectFilter,
            selectedProjectId:
              state.selectedProjectId === projectId
                ? null
                : state.selectedProjectId,
            selectedProjectView:
              state.selectedProjectId === projectId
                ? 'board'
                : state.selectedProjectView,
          });

          return {
            ...nextSelection,
            agents: state.agents.filter((agent) => agent.projectId !== projectId),
            isContextPanelOpen:
              isDeletedAgentSelected && state.route === 'agent'
                ? false
                : state.isContextPanelOpen,
            route:
              isDeletedAgentSelected && state.route === 'agent'
                ? 'workflow'
                : state.route,
            selectedAgentId:
              isDeletedAgentSelected
                ? null
                : state.selectedAgentId,
            selectedProjectScreen: 'main',
          };
        });
      },
      hydrateWorkflow: (snapshot) => {
        const nextSnapshot = ensureSelection(getWorkflowSnapshotState(snapshot));

        set({
          isWorkflowHydrated: true,
          items: nextSnapshot.items,
          projects: nextSnapshot.projects,
          selectedItemId: nextSnapshot.selectedItemId,
          selectedProjectFilter: nextSnapshot.selectedProjectFilter,
          selectedProjectId: nextSnapshot.selectedProjectId,
          selectedProjectScreen: 'main',
          selectedProjectView: nextSnapshot.selectedProjectView,
        });
      },
      moveItem: (itemId, status, index) => {
        set((state) => {
          const item = state.items.find((currentItem) => currentItem.id === itemId);

          if (!item) {
            return state;
          }

          const updatedAt = Date.now();
          const destination = getProjectItems(
            state.items.filter((currentItem) => currentItem.id !== itemId && currentItem.status === status),
            item.projectId,
          );
          const insertionIndex = Math.max(0, Math.min(index, destination.length));
          const before = destination.slice(0, insertionIndex);
          const after = destination.slice(insertionIndex);
          const movedItem = appendItemEvent(
            {
              ...item,
              status,
              // Prepend fresh checklist when rejected from review back to active
              ...(status === 'active' && item.status === 'review'
                ? { tasks: [...createDefaultTasks(updatedAt), ...item.tasks] }
                : {}),
            },
            'item',
            `Work item moved to ${describeItemStatus(status)}.`,
            updatedAt,
          );
          const nextItems = state.items.filter(
            (currentItem) => currentItem.id !== itemId && currentItem.projectId !== item.projectId,
          );
          const sameProjectOtherStatuses = state.items.filter(
            (currentItem) =>
              currentItem.id !== itemId &&
              currentItem.projectId === item.projectId &&
              currentItem.status !== status,
          );
          const reorderedStatusItems = [...before, movedItem, ...after];

          return {
            ...withSelection({
              items: [
                ...nextItems,
                ...sameProjectOtherStatuses,
                ...reorderedStatusItems,
              ],
              projects: touchProject(state.projects, item.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: item.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });
      },
      openProjectSettings: () => {
        set({ selectedProjectScreen: 'settings' });
      },
      closeProjectSettings: () => {
        set({ selectedProjectScreen: 'main' });
      },
      selectItem: (itemId) => {
        set((state) => {
          if (itemId !== null && !itemExists(state.items, itemId)) {
            return state;
          }

          const item = state.items.find((currentItem) => currentItem.id === itemId) ?? null;
          return {
            selectedItemId: itemId,
            selectedProjectId: item?.projectId ?? state.selectedProjectId,
            selectedProjectScreen: 'main',
            selectedProjectView: 'board' as WorkflowProjectView,
          };
        });
      },
      selectProject: (projectId) => {
        set((state) => {
          if (projectId !== null && !state.projects.some((project) => project.id === projectId)) {
            return state;
          }

          return {
            ...withSelection({
              items: state.items,
              projects: state.projects,
              selectedItemId: state.selectedItemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: projectId,
              selectedProjectView: state.selectedProjectView,
            }),
            selectedProjectScreen: 'main',
          };
        });
      },
      selectProjectFilter: (filter) => {
        set((state) => ({
          ...state,
          selectedProjectFilter: filter,
          selectedProjectScreen: 'main',
          selectedProjectView: 'board',
        }));
      },
      selectProjectView: (view) => {
        set({
          selectedProjectScreen: 'main',
          selectedProjectView: view,
        });
      },
      updateProject: (projectId, input) => {
        set((state) => {
          const targetProject = state.projects.find((project) => project.id === projectId);

          if (!targetProject) {
            return state;
          }

          const name = input.name?.trim();

          if (input.name !== undefined && !name) {
            return state;
          }

          const updatedAt = Date.now();
          const nextRootPath = normalizeProjectRootPath(input.rootPath);

          return {
            projects: state.projects.map((project) => {
              if (project.id !== projectId) {
                return project;
              }

              return {
                ...project,
                ...(name ? { name } : {}),
                ...(input.description !== undefined
                  ? { description: input.description.trim() }
                  : {}),
                ...(input.rootPath !== undefined && project.rootPath === null
                  ? { rootPath: nextRootPath }
                  : {}),
                updatedAt,
              };
            }),
          };
        });
      },
      updateItem: (itemId, input) => {
        set((state) => {
          const targetItem = state.items.find((item) => item.id === itemId);

          if (!targetItem) {
            return state;
          }

          const updatedAt = Date.now();

          return {
            ...withSelection({
              items: state.items.map((item) => {
                if (item.id !== itemId) {
                  return item;
                }

                const title = input.title?.trim();
                const brief = input.brief?.trim();
                const nextItem = {
                  ...item,
                  ...(title ? { title } : {}),
                  ...(brief !== undefined ? { brief } : {}),
                  updatedAt,
                };

                if (title === undefined && brief === undefined) {
                  return item;
                }

                return appendItemEvent(
                  nextItem,
                  'item',
                  'Work item details were updated.',
                  updatedAt,
                );
              }),
              projects: touchProject(state.projects, targetItem.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: targetItem.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });
      },
      updateTask: (itemId, taskId, input) => {
        set((state) => {
          const targetItem = state.items.find((item) => item.id === itemId);

          if (!targetItem) {
            return state;
          }

          const updatedAt = Date.now();

          return {
            ...withSelection({
              items: state.items.map((item) => {
                if (item.id !== itemId) {
                  return item;
                }

                const nextTasks = item.tasks.map((task) => {
                  if (task.id !== taskId) {
                    return task;
                  }

                  const title = input.title?.trim();

                  return {
                    ...task,
                    ...(title ? { title } : {}),
                    ...(input.notes !== undefined ? { notes: input.notes } : {}),
                    ...(input.status ? { status: input.status } : {}),
                    updatedAt,
                  };
                });

                return appendItemEvent(
                  {
                    ...item,
                    tasks: nextTasks,
                  },
                  'task',
                  'Checklist updated.',
                  updatedAt,
                );
              }),
              projects: touchProject(state.projects, targetItem.projectId, updatedAt),
              selectedItemId: itemId,
              selectedProjectFilter: state.selectedProjectFilter,
              selectedProjectId: targetItem.projectId,
              selectedProjectView: state.selectedProjectView,
            }),
          };
        });
      },
      setItemActivity: (itemId, activity) => {
        set((state) => ({
          itemActivity: {
            ...state.itemActivity,
            [itemId]: activity,
          },
        }));
      },
    };

    return {
      ...initialState,
      ...actions,
    };
  };
}
