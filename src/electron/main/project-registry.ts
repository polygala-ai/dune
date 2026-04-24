// Main-process project registry backed by app storage.

import type { DesktopRuntimeController } from '@/electron/main/runtime/desktop-runtime-controller';
import type { AppStorage } from '@/electron/main/storage';
import type { ProjectDescriptor, ProjectSettings, ProjectSettingsPatch } from '@/shared/electron/ipc-types';
import { createProjectId } from '@/shared/id';

const LEGACY_PROJECT_ID = '2bqWpDY6';
const APP_STATE_KEY = 'project-registry';
const DEFAULT_PROJECT_COLOR = '#4F7A78';

interface WorkflowProjectRecord {
  color: string;
  createdAt: number;
  description: string;
  id: string;
  name: string;
  rootPath: string | null;
  updatedAt: number;
}

interface WorkflowItemRecord {
  id: string;
  projectId: string;
  status: string;
}

interface WorkflowSnapshotRecord {
  items: WorkflowItemRecord[];
  projects: WorkflowProjectRecord[];
  selectedItemId: string | null;
  selectedProjectFilter: string;
  selectedProjectId: string | null;
  selectedProjectView: string;
}

interface RegistryState {
  archivedProjects: Record<string, number>;
  lastActiveProjectId: string | null;
  projectSettings: Record<string, ProjectSettings>;
}

interface ProjectRegistryOptions {
  getRuntimeController: () => DesktopRuntimeController | null;
  notifyProjectsChanged: () => void;
  workflowStore: AppStorage;
}

function createDefaultRegistryState(): RegistryState {
  return {
    archivedProjects: {},
    lastActiveProjectId: null,
    projectSettings: {},
  };
}

function normalizeSettings(value: unknown): ProjectSettings {
  if (!value || typeof value !== 'object') {
    return {
      defaultAgentId: null,
      telegramGroupId: null,
    };
  }

  const record = value as Record<string, unknown>;

  return {
    defaultAgentId: typeof record.defaultAgentId === 'string' ? record.defaultAgentId : null,
    telegramGroupId: typeof record.telegramGroupId === 'string' ? record.telegramGroupId : null,
  };
}

function normalizeRegistryState(value: unknown): RegistryState {
  if (!value || typeof value !== 'object') {
    return createDefaultRegistryState();
  }

  const record = value as Record<string, unknown>;
  const archivedProjects: Record<string, number> = {};
  const rawArchivedProjects = record.archivedProjects;

  if (rawArchivedProjects && typeof rawArchivedProjects === 'object') {
    for (const [projectId, archivedAt] of Object.entries(rawArchivedProjects)) {
      if (typeof archivedAt === 'number') {
        archivedProjects[projectId] = archivedAt;
      }
    }
  }

  const projectSettings: Record<string, ProjectSettings> = {};
  const rawProjectSettings = record.projectSettings;

  if (rawProjectSettings && typeof rawProjectSettings === 'object') {
    for (const [projectId, settings] of Object.entries(rawProjectSettings)) {
      projectSettings[projectId] = normalizeSettings(settings);
    }
  }

  return {
    archivedProjects,
    lastActiveProjectId: typeof record.lastActiveProjectId === 'string' ? record.lastActiveProjectId : null,
    projectSettings,
  };
}

function createEmptyWorkflowSnapshot(now: number): WorkflowSnapshotRecord {
  return {
    items: [],
    projects: [{
      color: DEFAULT_PROJECT_COLOR,
      createdAt: now,
      description: '',
      id: LEGACY_PROJECT_ID,
      name: 'Default',
      rootPath: null,
      updatedAt: now,
    }],
    selectedItemId: null,
    selectedProjectFilter: 'all',
    selectedProjectId: LEGACY_PROJECT_ID,
    selectedProjectView: 'board',
  };
}

function normalizeWorkflowSnapshot(value: unknown): WorkflowSnapshotRecord {
  const now = Date.now();

  if (!value || typeof value !== 'object') {
    return createEmptyWorkflowSnapshot(now);
  }

  const record = value as Record<string, unknown>;
  const projects = Array.isArray(record.projects)
    ? record.projects.flatMap((project) => {
        if (!project || typeof project !== 'object') {
          return [];
        }

        const projectRecord = project as Record<string, unknown>;
        if (typeof projectRecord.id !== 'string' || typeof projectRecord.name !== 'string') {
          return [];
        }

        return [{
          color: typeof projectRecord.color === 'string' ? projectRecord.color : DEFAULT_PROJECT_COLOR,
          createdAt: typeof projectRecord.createdAt === 'number' ? projectRecord.createdAt : now,
          description: typeof projectRecord.description === 'string' ? projectRecord.description : '',
          id: projectRecord.id,
          name: projectRecord.name,
          rootPath:
            typeof projectRecord.rootPath === 'string' || projectRecord.rootPath === null
              ? projectRecord.rootPath
              : null,
          updatedAt: typeof projectRecord.updatedAt === 'number' ? projectRecord.updatedAt : now,
        }];
      })
    : [];
  const projectIds = new Set(projects.map((project) => project.id));
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const itemRecord = item as Record<string, unknown>;
        const projectId = typeof itemRecord.projectId === 'string'
          ? itemRecord.projectId
          : projects[0]?.id ?? LEGACY_PROJECT_ID;

        if (typeof itemRecord.id !== 'string' || typeof itemRecord.status !== 'string') {
          return [];
        }

        return [{
          ...(itemRecord as unknown as WorkflowItemRecord),
          id: itemRecord.id,
          projectId,
          status: itemRecord.status,
        }];
      })
    : [];

  if (projects.length === 0) {
    projects.push(...createEmptyWorkflowSnapshot(now).projects);
    projectIds.add(LEGACY_PROJECT_ID);
  }

  for (const item of items) {
    if (!projectIds.has(item.projectId)) {
      item.projectId = projects[0]?.id ?? LEGACY_PROJECT_ID;
    }
  }

  const selectedProjectId =
    typeof record.selectedProjectId === 'string' && projectIds.has(record.selectedProjectId)
      ? record.selectedProjectId
      : projects[0]?.id ?? null;

  return {
    ...(record as unknown as WorkflowSnapshotRecord),
    items,
    projects,
    selectedItemId: typeof record.selectedItemId === 'string' ? record.selectedItemId : null,
    selectedProjectFilter: typeof record.selectedProjectFilter === 'string' ? record.selectedProjectFilter : 'all',
    selectedProjectId,
    selectedProjectView: typeof record.selectedProjectView === 'string' ? record.selectedProjectView : 'board',
  };
}

/** Manages multi-project metadata and active project selection. */
export class ProjectRegistry {
  private activeProjectId: string | null = null;

  private readonly controllers = new Map<string, DesktopRuntimeController>();

  constructor(private readonly options: ProjectRegistryOptions) {}

  async initialize() {
    const snapshot = await this.readSnapshot();
    const registryState = await this.readRegistryState();
    const activeProjectId = this.resolveActiveProjectId(snapshot, registryState);

    this.activeProjectId = activeProjectId;
    snapshot.selectedProjectId = activeProjectId;
    registryState.lastActiveProjectId = activeProjectId;

    await this.writeSnapshot(snapshot);
    await this.writeRegistryState(registryState);
  }

  async listProjects(): Promise<ProjectDescriptor[]> {
    const snapshot = await this.readSnapshot();
    const registryState = await this.readRegistryState();

    return snapshot.projects
      .map((project, index) => ({
        activeItemCount: snapshot.items.filter((item) => item.projectId === project.id && item.status !== 'done').length,
        archivedAt: registryState.archivedProjects[project.id] ?? null,
        description: project.description,
        id: project.id,
        name: project.name,
        sortOrder: index,
      }))
      .filter((project) => project.archivedAt === null)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async createProject(name: string, description = ''): Promise<ProjectDescriptor> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Project name is required.');
    }

    const snapshot = await this.readSnapshot();
    const now = Date.now();
    const project = {
      color: DEFAULT_PROJECT_COLOR,
      createdAt: now,
      description: description.trim(),
      id: createProjectId(),
      name: trimmedName,
      rootPath: null,
      updatedAt: now,
    };

    snapshot.projects.push(project);
    snapshot.selectedItemId = null;
    snapshot.selectedProjectId = project.id;
    this.activeProjectId = project.id;

    const registryState = await this.readRegistryState();
    registryState.lastActiveProjectId = project.id;

    await this.writeSnapshot(snapshot);
    await this.writeRegistryState(registryState);
    this.options.notifyProjectsChanged();

    return {
      activeItemCount: 0,
      archivedAt: null,
      description: project.description,
      id: project.id,
      name: project.name,
      sortOrder: snapshot.projects.length - 1,
    };
  }

  async switchProject(projectId: string) {
    const snapshot = await this.readSnapshot();
    if (!snapshot.projects.some((project) => project.id === projectId)) {
      throw new Error(`Project ${projectId} not found.`);
    }

    const registryState = await this.readRegistryState();
    if (registryState.archivedProjects[projectId]) {
      throw new Error(`Project ${projectId} is archived.`);
    }

    const currentController = this.getActiveController();
    if (currentController) {
      this.controllers.set(this.activeProjectId ?? projectId, currentController);
    }

    this.activeProjectId = projectId;
    snapshot.selectedItemId = null;
    snapshot.selectedProjectId = projectId;
    registryState.lastActiveProjectId = projectId;

    await this.writeSnapshot(snapshot);
    await this.writeRegistryState(registryState);
    this.options.notifyProjectsChanged();
  }

  async archiveProject(projectId: string) {
    const snapshot = await this.readSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      return;
    }

    const registryState = await this.readRegistryState();
    registryState.archivedProjects[projectId] = Date.now();

    if (snapshot.selectedProjectId === projectId) {
      const nextProject = snapshot.projects.find((candidate) =>
        candidate.id !== projectId && !registryState.archivedProjects[candidate.id]);
      snapshot.selectedProjectId = nextProject?.id ?? null;
      snapshot.selectedItemId = null;
      this.activeProjectId = nextProject?.id ?? null;
      registryState.lastActiveProjectId = nextProject?.id ?? null;
    }

    await this.writeSnapshot(snapshot);
    await this.writeRegistryState(registryState);
    this.options.notifyProjectsChanged();
  }

  async deleteProject(projectId: string) {
    const snapshot = await this.readSnapshot();
    const itemCount = snapshot.items.filter((item) => item.projectId === projectId).length;
    if (itemCount > 0) {
      throw new Error('Only projects with zero work items can be deleted.');
    }

    snapshot.projects = snapshot.projects.filter((project) => project.id !== projectId);
    if (snapshot.selectedProjectId === projectId) {
      snapshot.selectedProjectId = snapshot.projects[0]?.id ?? null;
      snapshot.selectedItemId = null;
      this.activeProjectId = snapshot.selectedProjectId;
    }

    const registryState = await this.readRegistryState();
    delete registryState.archivedProjects[projectId];
    delete registryState.projectSettings[projectId];
    registryState.lastActiveProjectId = snapshot.selectedProjectId;

    await this.writeSnapshot(snapshot);
    await this.writeRegistryState(registryState);
    this.options.notifyProjectsChanged();
  }

  async getProjectSettings(projectId: string): Promise<ProjectSettings> {
    const registryState = await this.readRegistryState();
    return registryState.projectSettings[projectId] ?? normalizeSettings(null);
  }

  async updateProjectSettings(projectId: string, patch: ProjectSettingsPatch): Promise<ProjectSettings> {
    const registryState = await this.readRegistryState();
    const current = registryState.projectSettings[projectId] ?? normalizeSettings(null);
    const next = {
      defaultAgentId: patch.defaultAgentId === undefined ? current.defaultAgentId : patch.defaultAgentId,
      telegramGroupId: patch.telegramGroupId === undefined ? current.telegramGroupId : patch.telegramGroupId,
    };

    registryState.projectSettings[projectId] = next;
    await this.writeRegistryState(registryState);
    return next;
  }

  getActiveController(): DesktopRuntimeController | null {
    return this.options.getRuntimeController();
  }

  private resolveActiveProjectId(snapshot: WorkflowSnapshotRecord, registryState: RegistryState) {
    const activeProjectIds = snapshot.projects
      .map((project) => project.id)
      .filter((projectId) => !registryState.archivedProjects[projectId]);

    if (registryState.lastActiveProjectId && activeProjectIds.includes(registryState.lastActiveProjectId)) {
      return registryState.lastActiveProjectId;
    }

    if (snapshot.selectedProjectId && activeProjectIds.includes(snapshot.selectedProjectId)) {
      return snapshot.selectedProjectId;
    }

    return activeProjectIds[0] ?? snapshot.projects[0]?.id ?? LEGACY_PROJECT_ID;
  }

  private async readRegistryState() {
    return normalizeRegistryState(await this.options.workflowStore.get(APP_STATE_KEY));
  }

  private async writeRegistryState(state: RegistryState) {
    await this.options.workflowStore.set(APP_STATE_KEY, state);
  }

  private async readSnapshot() {
    return normalizeWorkflowSnapshot(await this.options.workflowStore.get('snapshot'));
  }

  private async writeSnapshot(snapshot: WorkflowSnapshotRecord) {
    await this.options.workflowStore.set('snapshot', snapshot);
  }
}
