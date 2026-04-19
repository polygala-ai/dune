import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JsonFileStorage } from '@/electron/main/storage/json-file-storage';
import { resolveAgentLiteRuntimeRoot } from '@/electron/main/dune-paths';
import {
  normalizePersistedAgentRecord,
  type PersistedAgentRecord,
} from '@/electron/main/runtime/agent-runtime/records';
import { ensureProjectArtifactFolder } from '@/electron/main/workflow/project-artifacts';
import { presentItem, sanitizeAgent } from '@/electron/main/agent-actions/handlers/presenters';
import {
  compareItems,
  createWorkflowEvent,
  findItem,
  isWorkflowItemStatus,
  normalizeWorkflowSnapshot,
  readWorkflowSnapshot,
  reindexProjectStatusGroup,
  touchProject,
  type WorkflowEvent,
  type WorkflowItem,
  type WorkflowItemStatus,
  type WorkflowProject,
  type WorkflowSnapshot,
} from '@/electron/main/agent-actions/handlers/snapshot';
import { createId } from '@/shared/id';
import {
  buildRollingWorkflowItemActivitySummary,
  createPersistedWorkflowItemActivityArchive,
  createWorkflowItemActivityArchiveKey,
  createWorkflowItemActivitySummary,
  getWorkflowItemActivityArchiveItemId,
  MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS,
} from '@/shared/workflow/activity';
import { createDefaultTasks } from '@/shared/workflow/default-tasks';
import { createArtifactFolderName } from '@/shared/workflow/project-artifacts';

const CLI_ACTOR = 'Dune CLI';

const assignmentStatusPriority: Record<WorkflowItemStatus, number> = {
  active: 0,
  review: 1,
  acceptance: 2,
  ready: 3,
  inbox: 4,
  done: 5,
};

function getDefaultUserDataDir(
  homeDir: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Dune');
  }

  if (platform === 'win32') {
    return path.join(env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming'), 'Dune');
  }

  return path.join(env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config'), 'Dune');
}

function cloneWorkflowEvent(event: WorkflowEvent): WorkflowEvent {
  return {
    ...(event.actor ? { actor: event.actor } : {}),
    createdAt: event.createdAt,
    description: event.description,
    id: event.id,
    kind: event.kind,
  };
}

function dedupeWorkflowEventsChronologically(events: WorkflowEvent[]): WorkflowEvent[] {
  const seen = new Set<string>();
  const deduped: WorkflowEvent[] = [];

  for (const event of events) {
    if (seen.has(event.id)) {
      continue;
    }

    seen.add(event.id);
    deduped.push(cloneWorkflowEvent(event));
  }

  return deduped.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }

    return left.id.localeCompare(right.id);
  });
}

function compareAssignments(left: WorkflowItem, right: WorkflowItem): number {
  const leftPriority = assignmentStatusPriority[left.status as WorkflowItemStatus] ?? 99;
  const rightPriority = assignmentStatusPriority[right.status as WorkflowItemStatus] ?? 99;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return right.updatedAt - left.updatedAt;
}

function resolveProjectMatch(
  projects: WorkflowProject[],
  specifier: string,
): WorkflowProject {
  const trimmedSpecifier = specifier.trim();
  const lowerSpecifier = trimmedSpecifier.toLowerCase();
  const exactId = projects.find((project) => project.id === trimmedSpecifier) ?? null;

  if (exactId) {
    return exactId;
  }

  const nameMatches = projects.filter((project) => project.name.toLowerCase() === lowerSpecifier);

  if (nameMatches.length === 1) {
    const [project] = nameMatches;
    if (project) {
      return project;
    }
  }

  if (nameMatches.length > 1) {
    throw new Error(
      `Project "${trimmedSpecifier}" is ambiguous. Use a project id instead.`,
    );
  }

  throw new Error(`Project "${trimmedSpecifier}" was not found.`);
}

export interface DuneLocalClientOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  userDataDir?: string;
}

export interface CliAssignmentRecord {
  id: string;
  projectId: string;
  projectName: string | null;
  status: WorkflowItemStatus;
  title: string;
}

export interface CliAgentRecord extends ReturnType<typeof sanitizeAgent> {
  assignments: CliAssignmentRecord[];
  currentAssignment: CliAssignmentRecord | null;
  projectName: string | null;
}

export interface CliItemRecord extends ReturnType<typeof presentItem> {
  primaryAgentName: string | null;
  projectName: string;
}

export interface CliItemDetails extends CliItemRecord {
  events: WorkflowEvent[];
  primaryAgent: CliAgentRecord | null;
  project: {
    id: string;
    name: string;
  };
}

export class DuneLocalClient {
  private readonly agentStore: JsonFileStorage;

  readonly homeDir: string;

  private readonly runtimeRoot: string;

  readonly userDataDir: string;

  private readonly workflowStore: JsonFileStorage;

  constructor(options: DuneLocalClientOptions = {}) {
    this.homeDir = options.homeDir ?? os.homedir();
    const env = options.env ?? process.env;
    this.userDataDir = options.userDataDir ?? getDefaultUserDataDir(
      this.homeDir,
      options.platform ?? process.platform,
      env,
    );
    fs.mkdirSync(this.userDataDir, { recursive: true });
    this.runtimeRoot = resolveAgentLiteRuntimeRoot(env.DUNE_AGENTLITE_HOME_DIR ?? this.homeDir);
    this.agentStore = new JsonFileStorage(this.userDataDir, 'agents');
    this.workflowStore = new JsonFileStorage(this.userDataDir, 'workflow');
  }

  async listItems(projectSpecifier?: string): Promise<CliItemRecord[]> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const project = this.resolveProject(snapshot, projectSpecifier);
    const agentsById = await this.readAgentsById();

    return snapshot.items
      .filter((item) => item.projectId === project.id)
      .sort(compareItems)
      .map((item) => this.decorateItem(snapshot, item, agentsById));
  }

  async createItem(input: {
    brief?: string;
    project?: string;
    status?: string;
    title: string;
  }): Promise<CliItemRecord> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const project = this.resolveProject(snapshot, input.project);
    const title = input.title.trim();

    if (!title) {
      throw new Error('Work item title is required.');
    }

    const status = (input.status?.trim() ?? 'inbox') as WorkflowItemStatus;

    if (!isWorkflowItemStatus(status)) {
      throw new Error('Status must be one of: inbox, ready, active, review, acceptance, done.');
    }

    const now = Date.now();
    const itemId = createId('item');
    const artifactFolderName = createArtifactFolderName(title, itemId);
    const item: WorkflowItem = {
      activity: createWorkflowItemActivitySummary({
        totalEventCount: 1,
      }),
      artifactFolderName,
      brief: input.brief?.trim() ?? '',
      createdAt: now,
      id: itemId,
      primaryAgentId: null,
      projectId: project.id,
      scheduledTaskId: null,
      sortOrder: snapshot.items.filter((item) =>
        item.projectId === project.id && item.status === status).length,
      status,
      tasks: createDefaultTasks(now),
      title,
      updatedAt: now,
      workProducts: [],
      workflowEvents: [
        createWorkflowEvent('item', `Work item "${title}" was created.`, now, CLI_ACTOR),
      ],
    };

    snapshot.items.push(item);
    touchProject(snapshot, project.id, now);

    if (project.rootPath) {
      ensureProjectArtifactFolder(project.rootPath, artifactFolderName);
    }

    await this.writeWorkflowSnapshot(snapshot);
    return this.decorateItem(snapshot, item, await this.readAgentsById());
  }

  async moveItem(itemId: string, statusInput: string): Promise<CliItemRecord> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const item = findItem(snapshot, itemId.trim());
    const status = statusInput.trim() as WorkflowItemStatus;

    if (!isWorkflowItemStatus(status)) {
      throw new Error('Status must be one of: inbox, ready, active, review, acceptance, done.');
    }

    if (item.status === status) {
      return this.decorateItem(snapshot, item, await this.readAgentsById());
    }

    const now = Date.now();
    const previousStatus = item.status;
    const destinationItems = snapshot.items
      .filter((candidate) =>
        candidate.id !== item.id
        && candidate.projectId === item.projectId
        && candidate.status === status)
      .sort(compareItems);

    item.status = status;
    item.updatedAt = now;
    item.sortOrder = destinationItems.length;
    // The CLI edits persisted workflow state without a live runtime controller.
    // Let the desktop app recreate any needed assignment task on the next boot.
    item.scheduledTaskId = null;
    item.workflowEvents.unshift(
      createWorkflowEvent('item', `Work item moved to ${status}.`, now, CLI_ACTOR),
    );

    if (status === 'active' && previousStatus === 'review') {
      item.tasks.unshift(...createDefaultTasks(now));
    }

    destinationItems.push(item);
    for (const [index, candidate] of destinationItems.entries()) {
      candidate.sortOrder = index;
    }

    reindexProjectStatusGroup(snapshot.items, item.projectId, previousStatus);
    touchProject(snapshot, item.projectId, now);

    await this.writeWorkflowSnapshot(snapshot);
    return this.decorateItem(snapshot, item, await this.readAgentsById());
  }

  async showItem(itemId: string): Promise<CliItemDetails> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const item = findItem(snapshot, itemId.trim());
    const agentsById = await this.readAgentsById();
    const decoratedItem = this.decorateItem(snapshot, item, agentsById);
    const project = snapshot.projects.find((project) => project.id === item.projectId) ?? null;

    if (!project) {
      throw new Error(`Project ${item.projectId} was not found.`);
    }

    return {
      ...decoratedItem,
      events: await this.readItemEvents(item),
      primaryAgent: item.primaryAgentId ? agentsById.get(item.primaryAgentId) ?? null : null,
      project: {
        id: project.id,
        name: project.name,
      },
    };
  }

  async addFeedback(itemId: string, message: string): Promise<CliItemRecord> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const item = findItem(snapshot, itemId.trim());
    const feedback = message.trim();

    if (!feedback) {
      throw new Error('Feedback message is required.');
    }

    const now = Date.now();
    item.workflowEvents.unshift(createWorkflowEvent('feedback', feedback, now, CLI_ACTOR));
    item.updatedAt = now;
    touchProject(snapshot, item.projectId, now);

    await this.writeWorkflowSnapshot(snapshot);
    return this.decorateItem(snapshot, item, await this.readAgentsById());
  }

  async listAgents(projectSpecifier?: string): Promise<CliAgentRecord[]> {
    const snapshot = await readWorkflowSnapshot(this.workflowStore);
    const projectFilter = projectSpecifier?.trim()
      ? this.resolveProject(snapshot, projectSpecifier).id
      : null;
    const projectNamesById = new Map(snapshot.projects.map((project) => [project.id, project.name] as const));

    return (await this.readAgents())
      .filter((agent) => projectFilter ? agent.projectId === projectFilter : true)
      .map((agent) => {
        const assignments = snapshot.items
          .filter((item) => item.primaryAgentId === agent.id && item.status !== 'done')
          .sort(compareAssignments)
          .map((item) => ({
            id: item.id,
            projectId: item.projectId,
            projectName: projectNamesById.get(item.projectId) ?? null,
            status: item.status as WorkflowItemStatus,
            title: item.title,
          }));

        return {
          ...agent,
          assignments,
          currentAssignment: assignments[0] ?? null,
          projectName: agent.projectId ? projectNamesById.get(agent.projectId) ?? null : null,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private decorateItem(
    snapshot: WorkflowSnapshot,
    item: WorkflowItem,
    agentsById: Map<string, CliAgentRecord>,
  ): CliItemRecord {
    const project = snapshot.projects.find((project) => project.id === item.projectId) ?? null;

    if (!project) {
      throw new Error(`Project ${item.projectId} was not found.`);
    }

    return {
      ...presentItem(snapshot, item),
      primaryAgentName: item.primaryAgentId
        ? agentsById.get(item.primaryAgentId)?.name ?? null
        : null,
      projectName: project.name,
    };
  }

  private async readAgents(): Promise<CliAgentRecord[]> {
    const records = (await this.agentStore.get<PersistedAgentRecord[]>('agents')) ?? [];

    return records
      .map((record) => normalizePersistedAgentRecord(record, this.runtimeRoot).agent)
      .map((agent) => ({
        ...sanitizeAgent(agent),
        assignments: [],
        currentAssignment: null,
        projectName: null,
      }));
  }

  private async readAgentsById(): Promise<Map<string, CliAgentRecord>> {
    return new Map((await this.readAgents()).map((agent) => [agent.id, agent] as const));
  }

  private async readItemEvents(item: WorkflowItem): Promise<WorkflowEvent[]> {
    const archive = createPersistedWorkflowItemActivityArchive(
      await this.workflowStore.get(createWorkflowItemActivityArchiveKey(item.id)) ?? {},
    );
    const events = dedupeWorkflowEventsChronologically([
      ...archive.events,
      ...item.workflowEvents,
    ]);

    return events.sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt;
      }

      return right.id.localeCompare(left.id);
    });
  }

  private resolveProject(
    snapshot: WorkflowSnapshot,
    projectSpecifier?: string,
  ): WorkflowProject {
    if (snapshot.projects.length === 0) {
      throw new Error(`No Dune projects were found in ${this.userDataDir}.`);
    }

    if (projectSpecifier?.trim()) {
      return resolveProjectMatch(snapshot.projects, projectSpecifier);
    }

    if (snapshot.selectedProjectId) {
      const selectedProject = snapshot.projects.find((project) => project.id === snapshot.selectedProjectId) ?? null;

      if (selectedProject) {
        return selectedProject;
      }
    }

    if (snapshot.projects.length === 1) {
      const [project] = snapshot.projects;
      if (project) {
        return project;
      }
    }

    throw new Error('Multiple Dune projects were found. Pass --project <id-or-name>.');
  }

  private async writeWorkflowSnapshot(snapshot: WorkflowSnapshot): Promise<void> {
    normalizeWorkflowSnapshot(snapshot);
    await this.compactWorkflowActivity(snapshot);
    await this.workflowStore.set('snapshot', snapshot);
  }

  private async compactWorkflowActivity(snapshot: WorkflowSnapshot): Promise<void> {
    const activeItemIds = new Set(snapshot.items.map((item) => item.id));
    const workflowKeys = await this.workflowStore.keys();
    const staleArchiveKeys = workflowKeys.filter((key) => {
      const itemId = getWorkflowItemActivityArchiveItemId(key);
      return itemId !== null && !activeItemIds.has(itemId);
    });

    await Promise.all(staleArchiveKeys.map((key) => this.workflowStore.delete(key)));

    for (const item of snapshot.items) {
      const archiveKey = createWorkflowItemActivityArchiveKey(item.id);
      const existingArchive = createPersistedWorkflowItemActivityArchive(
        await this.workflowStore.get(archiveKey) ?? {},
      );
      const liveEvents = Array.isArray(item.workflowEvents)
        ? item.workflowEvents.map((event) => cloneWorkflowEvent(event))
        : [];
      const liveWindow = liveEvents.slice(0, MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS);
      const overflow = liveEvents.slice(MAX_LIVE_WORKFLOW_ITEM_ACTIVITY_EVENTS).reverse();
      const archivedEvents = dedupeWorkflowEventsChronologically([
        ...existingArchive.events,
        ...overflow,
      ]);
      const rollingSummary = buildRollingWorkflowItemActivitySummary(item.title, archivedEvents);

      item.activity = createWorkflowItemActivitySummary({
        archivedEventCount: archivedEvents.length,
        hasOlderEvents: archivedEvents.length > 0,
        rollingSummary,
        totalEventCount: archivedEvents.length + liveWindow.length,
      });
      item.workflowEvents = liveWindow;

      if (archivedEvents.length === 0) {
        if (existingArchive.events.length > 0 || existingArchive.rollingSummary) {
          await this.workflowStore.delete(archiveKey);
        }
        continue;
      }

      await this.workflowStore.set(archiveKey, {
        events: archivedEvents,
        lastCompactedAt: Date.now(),
        rollingSummary,
      });
    }
  }
}
