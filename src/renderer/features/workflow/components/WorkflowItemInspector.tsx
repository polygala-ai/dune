import { useEffect, useState } from 'react';
import { ArrowUpRight, Bot, Plus } from 'lucide-react';

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

const itemStatuses: WorkflowItemStatus[] = ['inbox', 'ready', 'active', 'review', 'done'];
const taskStatuses: WorkflowTaskStatus[] = ['todo', 'doing', 'blocked', 'review', 'done'];

interface WorkflowItemInspectorProps {
  item: (Omit<WorkflowItem, 'workProducts' | 'workflowEvents'> & {
    primaryAgentName: string | null;
    workProducts: Array<{ body: string; createdAt: number; createdAtLabel: string; id: string; title: string }>;
    workflowEvents: Array<{ createdAt: number; createdAtLabel: string; description: string; id: string; kind: string }>;
  }) | null;
  onAddTask: (itemId: string, title: string) => void;
  onAddWorkProduct: (itemId: string, input: { body: string; title: string }) => void;
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

export function WorkflowItemInspector({
  item,
  onAddTask,
  onAddWorkProduct,
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
  const [productTitle, setProductTitle] = useState('');
  const [productBody, setProductBody] = useState('');

  useEffect(() => {
    setTitleValue(item?.title ?? '');
    setBriefValue(item?.brief ?? '');
    setNewTaskTitle('');
    setProductTitle('');
    setProductBody('');
  }, [item?.id]);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-app-border bg-app-panel/80 px-8 text-center">
        <div>
          <div className="surface-eyebrow">Inspector</div>
          <h2 className="surface-title">Select a work item</h2>
          <p className="surface-description">
            Keep the board light. Editing, assignment, outputs, and activity all live here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-app-border bg-app-panel/90"
      data-testid="workflow-item-inspector"
    >
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-6">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-app-border pb-5">
            <div className="min-w-0 flex-1">
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

              <input
                className="mt-3 w-full border-0 bg-transparent p-0 text-[1.6rem] font-semibold tracking-[-0.05em] text-app-text outline-none"
                onBlur={() => {
                  if (titleValue.trim() && titleValue.trim() !== item.title) {
                    onUpdateItem(item.id, { title: titleValue });
                  } else {
                    setTitleValue(item.title);
                  }
                }}
                onChange={(event) => setTitleValue(event.target.value)}
                value={titleValue}
              />
              <textarea
                className="focus-ring-app mt-3 min-h-[112px] w-full rounded-[20px] border border-app-border bg-app-card/60 px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
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

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <select
                aria-label="Work item status"
                className="focus-ring-app h-10 rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
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

              {item.primaryAgentId ? (
                <Button
                  onClick={() => onOpenAgent(item.primaryAgentId!)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Open agent
                </Button>
              ) : (
                <Button
                  onClick={() => onCreateAgent(item.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Create agent
                </Button>
              )}
            </div>
          </div>

          <section className="space-y-3">
            <div className="surface-eyebrow">Primary Agent</div>
            <div className="rounded-[20px] border border-app-border bg-app-card/60 p-4">
              <div className="flex items-center gap-3">
                <Bot className="h-4 w-4 text-app-muted" />
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
                <Button
                  onClick={() => onCreateAgent(item.id)}
                  size="sm"
                  type="button"
                  variant="quiet"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              <p className="mt-3 text-sm leading-6 text-app-muted">
                {item.primaryAgentName
                  ? `${item.primaryAgentName} is the primary execution owner for this work item.`
                  : 'Keep assignment optional until the work is ready for an agent.'}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <div className="surface-eyebrow">Checklist</div>
              <div className="mt-1 text-sm text-app-muted">
                Keep the supporting steps lightweight and visible.
              </div>
            </div>

            <div className="space-y-2">
              {item.tasks.map((task) => (
                <div
                  className="rounded-[18px] border border-app-border bg-app-card/60 p-3"
                  key={task.id}
                >
                  <div className="flex items-center gap-3">
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-app-text outline-none"
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
                    <select
                      aria-label={`Status for ${task.title}`}
                      className="h-9 rounded-[14px] border border-app-border bg-app-panel px-3 text-sm text-app-text outline-none"
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
              ))}
            </div>

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
          </section>

          <section className="space-y-3">
            <div>
              <div className="surface-eyebrow">Outputs</div>
              <div className="mt-1 text-sm text-app-muted">
                Keep the latest notes, summaries, and drafts attached to the work item.
              </div>
            </div>

            <div className="space-y-3">
              <input
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 text-sm text-app-text outline-none placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
                onChange={(event) => setProductTitle(event.target.value)}
                placeholder="Output title"
                value={productTitle}
              />
              <textarea
                className="focus-ring-app min-h-[120px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
                onChange={(event) => setProductBody(event.target.value)}
                placeholder="Add a note, summary, or work product."
                value={productBody}
              />
              <div className="flex justify-end">
                <Button
                  disabled={!productTitle.trim() || !productBody.trim()}
                  onClick={() => {
                    onAddWorkProduct(item.id, {
                      body: productBody,
                      title: productTitle,
                    });
                    setProductTitle('');
                    setProductBody('');
                  }}
                  type="button"
                  variant="outline"
                >
                  Add output
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {item.workProducts.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-app-border bg-app-panel/60 px-4 py-4 text-sm leading-6 text-app-muted">
                  No outputs yet. Keep the board quiet and attach the fuller thinking here.
                </div>
              ) : (
                item.workProducts.map((product) => (
                  <div
                    className="rounded-[18px] border border-app-border bg-app-card/60 p-4"
                    key={product.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-app-text">{product.title}</div>
                      <span className="pill-key border-transparent bg-app-panel">
                        {product.createdAtLabel}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-app-muted">
                      {product.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <div className="surface-eyebrow">Activity</div>
              <div className="mt-1 text-sm text-app-muted">
                Local changes, assignment moves, and checklist updates stay attached here.
              </div>
            </div>

            <div className="space-y-2">
              {item.workflowEvents.map((event) => (
                <div
                  className="flex items-start justify-between gap-3 rounded-[16px] border border-app-border bg-app-card/60 px-4 py-3"
                  key={event.id}
                >
                  <p className="text-sm leading-6 text-app-text">{event.description}</p>
                  <span className="pill-key border-transparent bg-app-panel">
                    {event.createdAtLabel}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
