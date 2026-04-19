// Workflow item detail and checklist UI.

import { type ReactNode, useEffect, useState } from 'react';
import {
  Bot,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
} from 'lucide-react';

import { formatMessageTimestamp } from '@/renderer/features/agents/model/time';
import {
  formatWorkflowItemStatus,
  formatWorkflowTaskStatus,
} from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowItem,
  WorkflowItemStatus,
  WorkflowProject,
  WorkflowTaskStatus,
} from '@/renderer/features/workflow/types';
import { Button } from '@/renderer/shared/ui/button';
import {
  resolveItemArtifactPath,
  type ProjectArtifactEntry,
} from '@/shared/workflow/project-artifacts';

const itemStatuses: WorkflowItemStatus[] = ['inbox', 'ready', 'active', 'review', 'done'];
const taskStatuses: WorkflowTaskStatus[] = ['todo', 'doing', 'blocked', 'review', 'done'];

/** Workflow item inspector props. */
interface WorkflowItemInspectorProps {
  item: (Omit<WorkflowItem, 'workflowEvents'> & {
    primaryAgentName: string | null;
    workflowEvents: Array<{ createdAt: number; createdAtLabel: string; description: string; id: string; kind: string }>;
  }) | null;
  onAddTask: (itemId: string, title: string) => void;
  onAssignPrimaryAgent: (itemId: string, input: { agentId: string | null; agentName?: string | null }) => void;
  onCreateAgent: (itemId: string) => void;
  onOpenAgent: (agentId: string) => void;
  onUpdateItem: (itemId: string, input: { brief?: string; title?: string }) => void;
  onUpdateItemStatus: (itemId: string, status: WorkflowItemStatus) => void;
  onUpdateTask: (
    itemId: string,
    taskId: string,
    input: { notes?: string; status?: WorkflowTaskStatus; title?: string },
  ) => void;
  project: WorkflowProject | null;
  projectAgents: Array<{ id: string; name: string }>;
}

/** Renders the inspector section UI. */
function InspectorSection({
  actions,
  badge,
  children,
  description,
  eyebrow,
}: {
  actions?: ReactNode;
  badge?: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
}) {
  return (
    <section className="rounded-[24px] border border-app-border bg-app-card/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="surface-eyebrow">{eyebrow}</div>
          <p className="mt-2 text-sm leading-6 text-app-muted">{description}</p>
        </div>
        {actions || badge ? (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {badge ? (
              <span className="pill-key border-transparent bg-app-panel">
                {badge}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Formats artifact size. */
function formatArtifactSize(size: number | null) {
  if (size === null) {
    return 'Folder';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Renders the workflow item inspector UI. */
export function WorkflowItemInspector({
  item,
  onAddTask,
  onAssignPrimaryAgent,
  onCreateAgent,
  onOpenAgent,
  onUpdateItem,
  onUpdateItemStatus,
  onUpdateTask,
  project,
  projectAgents,
}: WorkflowItemInspectorProps) {
  const [titleValue, setTitleValue] = useState('');
  const [briefValue, setBriefValue] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [artifactEntries, setArtifactEntries] = useState<ProjectArtifactEntry[]>([]);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactStatus, setArtifactStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [artifactRefreshNonce, setArtifactRefreshNonce] = useState(0);

  useEffect(() => {
    setTitleValue(item?.title ?? '');
    setBriefValue(item?.brief ?? '');
    setNewTaskTitle('');
  }, [item?.id]);

  const artifactFolderPath = item
    ? resolveItemArtifactPath(project?.rootPath ?? null, item.artifactFolderName)
    : null;
  const canListArtifacts = typeof window.duneDesktop?.listProjectArtifactEntries === 'function';
  const canOpenPaths = typeof window.duneDesktop?.openPath === 'function';

  useEffect(() => {
    let cancelled = false;

    /** Loads artifacts. */
    const loadArtifacts = async () => {
      if (!item) {
        setArtifactEntries([]);
        setArtifactError(null);
        setArtifactStatus('idle');
        return;
      }

      if (!project?.rootPath || !item.artifactFolderName.trim()) {
        setArtifactEntries([]);
        setArtifactError(null);
        setArtifactStatus('ready');
        return;
      }

      if (!canListArtifacts) {
        setArtifactEntries([]);
        setArtifactError('Artifact listing is unavailable in this environment.');
        setArtifactStatus('error');
        return;
      }

      setArtifactStatus('loading');

      try {
        const nextEntries = await window.duneDesktop?.listProjectArtifactEntries?.(
          project.rootPath,
          item.artifactFolderName,
        ) ?? [];

        if (cancelled) {
          return;
        }

        setArtifactEntries(nextEntries);
        setArtifactError(null);
        setArtifactStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setArtifactEntries([]);
        setArtifactError(error instanceof Error ? error.message : 'Unable to load artifact folder.');
        setArtifactStatus('error');
      }
    };

    void loadArtifacts();

    return () => {
      cancelled = true;
    };
  }, [
    artifactRefreshNonce,
    canListArtifacts,
    item?.id,
    item?.artifactFolderName,
    project?.rootPath,
  ]);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-app-border bg-app-panel/80 px-8 text-center">
        <div>
          <div className="surface-eyebrow">Inspector</div>
          <h2 className="surface-title">Select a work item</h2>
          <p className="surface-description">
            Keep the board light. Editing, assignment, artifacts, and activity all live here.
          </p>
        </div>
      </div>
    );
  }

  const primaryAgentId = item.primaryAgentId;
  const artifactCount = artifactEntries.length;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-app-border bg-app-panel/90"
      data-testid="workflow-item-inspector"
    >
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-6">
        <div className="space-y-4">
          <section className="rounded-[24px] border border-app-border bg-app-card/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {project ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-card/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.name}
                  </span>
                ) : null}
                <span className="pill-key border-transparent bg-app-card">
                  {formatWorkflowItemStatus(item.status)}
                </span>
              </div>

              <select
                aria-label="Work item status"
                className="focus-ring-app h-10 rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 sm:w-[152px]"
                onChange={(event) =>
                  onUpdateItemStatus(
                    item.id,
                    event.target.value as WorkflowItemStatus,
                  )
                }
                value={item.status}
              >
                {itemStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatWorkflowItemStatus(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5">
              <div className="surface-eyebrow">Work item</div>
              <input
                aria-label="Work item title"
                className="mt-3 w-full border-0 bg-transparent p-0 text-[1.9rem] font-semibold tracking-[-0.06em] text-app-text outline-none"
                onBlur={() => {
                  if (titleValue.trim() && titleValue.trim() !== item.title) {
                    onUpdateItem(item.id, { title: titleValue });
                  } else {
                    setTitleValue(item.title);
                  }
                }}
                onChange={(event) => setTitleValue(event.target.value)}
                placeholder="Untitled work item"
                value={titleValue}
              />
            </div>

            <div className="mt-4 rounded-[20px] border border-app-border bg-app-panel/60 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                Brief
              </div>
              <textarea
                aria-label="Work item brief"
                className="focus-ring-app mt-3 min-h-[112px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:ring-0"
                onBlur={() => {
                  if (briefValue.trim() !== item.brief) {
                    onUpdateItem(item.id, { brief: briefValue });
                  }
                }}
                onChange={(event) => setBriefValue(event.target.value)}
                placeholder="Capture the goal and intended outcome."
                value={briefValue}
              />
            </div>

            <div className="mt-4 rounded-[20px] border border-app-border bg-app-panel/60 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-app-border bg-app-card/70 text-app-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    Owner
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <select
                      aria-label="Primary agent"
                      className="focus-ring-app h-10 min-w-0 flex-1 rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                      onChange={(event) => {
                        const nextAgentId = event.target.value || null;
                        const nextAgent = projectAgents.find((agent) => agent.id === nextAgentId) ?? null;
                        onAssignPrimaryAgent(item.id, {
                          agentId: nextAgentId,
                          agentName: nextAgent?.name ?? null,
                        });
                      }}
                      value={item.primaryAgentId ?? ''}
                    >
                      <option value="">No agent</option>
                      {projectAgents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    {primaryAgentId ? (
                      <Button
                        onClick={() => onOpenAgent(primaryAgentId)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Open agent
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onCreateAgent(item.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus className="h-4 w-4" />
                        Create agent
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-app-muted">
                    {item.primaryAgentName
                      ? `${item.primaryAgentName} is working this item.`
                      : 'Assign an owner when the work is ready.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <InspectorSection
            badge={item.tasks.length === 0 ? 'Empty' : `${item.tasks.length} steps`}
            description="Small checklist for the work."
            eyebrow="Checklist"
          >
            <div className="space-y-3">
              {item.tasks.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                  No checklist steps yet. Capture just enough structure to keep the work moving.
                </div>
              ) : (
                item.tasks.map((task) => (
                  <div
                    className="rounded-[18px] border border-app-border bg-app-panel/55 p-3.5"
                    key={task.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                          {formatWorkflowTaskStatus(task.status)}
                        </div>
                        <input
                          className="mt-2 min-w-0 w-full border-0 bg-transparent p-0 text-sm font-medium text-app-text outline-none"
                          defaultValue={task.title}
                          onBlur={(event) => {
                            const nextTitle = event.target.value.trim();
                            if (nextTitle && nextTitle !== task.title) {
                              onUpdateTask(item.id, task.id, { title: nextTitle });
                            } else {
                              event.target.value = task.title;
                            }
                          }}
                        />
                      </div>
                      <select
                        aria-label={`Status for ${task.title}`}
                        className="focus-ring-app h-9 w-full rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2 sm:w-[148px]"
                        onChange={(event) =>
                          onUpdateTask(item.id, task.id, {
                            status: event.target.value as WorkflowTaskStatus,
                          })
                        }
                        value={task.status}
                      >
                        {taskStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatWorkflowTaskStatus(status)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}

              <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 p-3">
                <div className="flex gap-2">
                  <input
                    className="focus-ring-app h-11 flex-1 rounded-[16px] border border-app-border bg-app-panel px-4 text-sm text-app-text outline-none placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newTaskTitle.trim()) {
                        event.preventDefault();
                        onAddTask(item.id, newTaskTitle);
                        setNewTaskTitle('');
                      }
                    }}
                    placeholder="Add a checklist step"
                    value={newTaskTitle}
                  />
                  <Button
                    disabled={!newTaskTitle.trim()}
                    onClick={() => {
                      onAddTask(item.id, newTaskTitle);
                      setNewTaskTitle('');
                    }}
                    size="icon"
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection
            actions={artifactFolderPath ? (
              <>
                <Button
                  disabled={!canOpenPaths}
                  onClick={() => {
                    void window.duneDesktop?.openPath?.(artifactFolderPath);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FolderOpen className="h-4 w-4" />
                  Open folder
                </Button>
                <Button
                  onClick={() => setArtifactRefreshNonce((value) => value + 1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </>
            ) : null}
            badge={
              !artifactFolderPath
                ? 'Disabled'
                : artifactStatus === 'loading'
                  ? 'Refreshing'
                  : artifactStatus === 'error'
                    ? 'Unavailable'
                    : artifactCount === 0
                      ? 'Empty'
                      : `${artifactCount} listed`
            }
            description="Files generated for this work item."
            eyebrow="Artifacts"
          >
            {!artifactFolderPath ? (
              <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                This project does not have a project folder yet, so this work item has no on-disk artifact folder.
              </div>
            ) : artifactStatus === 'loading' ? (
              <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                Loading artifact folder contents.
              </div>
            ) : artifactStatus === 'error' ? (
              <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                {artifactError ?? 'Unable to load artifact folder contents.'}
              </div>
            ) : artifactEntries.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                No artifacts yet. Agents can create files and folders here for this work item.
              </div>
            ) : (
              <div className="space-y-2">
                {artifactEntries.map((entry) => (
                  <div
                    className="rounded-[18px] border border-app-border bg-app-panel/55 p-4"
                    data-testid="workflow-artifact-row"
                    key={entry.path}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-app-border bg-app-card/70 text-app-muted">
                        {entry.kind === 'directory'
                          ? <Folder className="h-4 w-4" />
                          : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-app-text">
                          {entry.relativePath}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                          <span>{entry.kind === 'directory' ? 'Folder' : 'File'}</span>
                          <span>&middot;</span>
                          <span>{formatArtifactSize(entry.size)}</span>
                          <span>&middot;</span>
                          <span>{formatMessageTimestamp(entry.modifiedAt)}</span>
                        </div>
                      </div>
                      <Button
                        aria-label={`Open artifact ${entry.relativePath}`}
                        disabled={!canOpenPaths}
                        onClick={() => {
                          void window.duneDesktop?.openPath?.(entry.path);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </InspectorSection>

          <InspectorSection
            badge={
              item.activity.totalEventCount === 0
                ? 'No events'
                : `${item.activity.totalEventCount} ${item.activity.totalEventCount === 1 ? 'event' : 'events'}`
            }
            description="Recent changes for this item."
            eyebrow="Activity"
          >
            <div className="space-y-3">
              {item.activity.rollingSummary ? (
                <div className="rounded-[18px] border border-app-border bg-app-card/55 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-app-muted">
                    <span>Archived Summary</span>
                    <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                    <span>{item.activity.archivedEventCount} archived</span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-app-text">
                    {item.activity.rollingSummary}
                  </pre>
                </div>
              ) : null}

              {item.workflowEvents.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-app-border bg-app-panel/35 px-4 py-4 text-sm leading-6 text-app-muted">
                  Activity will appear here as the work item changes.
                </div>
              ) : (
                item.workflowEvents.map((event) => (
                  <div className="relative pl-5" key={event.id}>
                    <div className="absolute left-[5px] top-3 h-2.5 w-2.5 rounded-full bg-app-accent/70" />
                    <div className="rounded-[16px] border border-app-border bg-app-panel/55 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {'actor' in event && event.actor ? (
                            <p className="text-xs font-medium text-app-accent">{String(event.actor)}</p>
                          ) : null}
                          <p className="text-sm leading-6 text-app-text">{event.description}</p>
                        </div>
                        <span className="pill-key shrink-0 border-transparent bg-app-panel">
                          {event.createdAtLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </InspectorSection>
        </div>
      </div>
    </div>
  );
}
