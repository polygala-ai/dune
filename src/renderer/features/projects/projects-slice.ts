// Project registry slice helpers.

import type { StateCreator } from 'zustand';
import type { ProjectDescriptor, ProjectSettings } from '@/shared/electron/ipc-types';

/** Project registry state. */
export interface ProjectsState {
  activeProjectId: string | null;
  projectSettings: Record<string, ProjectSettings>;
  projects: ProjectDescriptor[];
}

/** Project registry actions. */
export interface ProjectsActions {
  removeProject: (projectId: string) => void;
  setActiveProject: (projectId: string | null) => void;
  setProjectSettings: (projectId: string, settings: ProjectSettings) => void;
  setProjects: (projects: ProjectDescriptor[]) => void;
}

/** Project registry slice. */
export type ProjectsSlice = ProjectsState & ProjectsActions;

/** Creates initial projects state. */
export function createInitialProjectsState(): ProjectsState {
  return {
    activeProjectId: null,
    projectSettings: {},
    projects: [],
  };
}

/** Creates project slice. */
export function createProjectsSlice(initialState: ProjectsState): StateCreator<ProjectsSlice> {
  return (set) => ({
    ...initialState,
    removeProject: (projectId) => {
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== projectId),
      }));
    },
    setActiveProject: (projectId) => {
      set({ activeProjectId: projectId });
    },
    setProjectSettings: (projectId, settings) => {
      set((state) => ({
        projectSettings: {
          ...state.projectSettings,
          [projectId]: settings,
        },
      }));
    },
    setProjects: (projects) => {
      set({ projects });
    },
  });
}
