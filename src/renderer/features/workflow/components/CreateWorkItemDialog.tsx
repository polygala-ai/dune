// Create work item dialog UI.

import { useEffect, useState } from 'react';

import type { TemplateScopedAgent } from '@/shared/workflow/work-item-templates';
import {
  createWorkItemTemplatePrefill,
  resolveWorkItemTemplateDefaultAgent,
  type WorkItemTemplate,
} from '@/shared/workflow/work-item-templates';
import {
  loadCustomWorkItemTemplates,
  mergeWorkItemTemplates,
} from '@/renderer/features/settings/model/work-item-templates';
import type {
  WorkflowItemStatus,
  WorkflowProject,
} from '@/renderer/features/workflow/types';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';

const itemStatuses: WorkflowItemStatus[] = ['inbox', 'ready', 'active', 'review', 'acceptance', 'done'];

const STORE_NAME = 'settings';

function createSettingsStore() {
  return {
    get: async <T,>(key: string): Promise<T | null> => {
      const value = await window.duneDesktop?.storageGet?.(STORE_NAME, key);
      return (value as T | null | undefined) ?? null;
    },
  };
}

const settingsStore = createSettingsStore();

/** Create work item dialog props. */
interface CreateWorkItemDialogProps {
  agents: TemplateScopedAgent[];
  initialProjectId: string | null;
  onCreateItem: (input: {
    brief: string;
    primaryAgentId?: string | null;
    primaryAgentName?: string | null;
    projectId: string;
    status: WorkflowItemStatus;
    taskTitles?: string[];
    title: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: WorkflowProject[];
}

/** Renders the create work item dialog UI. */
export function CreateWorkItemDialog({
  agents,
  initialProjectId,
  onCreateItem,
  onOpenChange,
  open,
  projects,
}: CreateWorkItemDialogProps) {
  const [availableTemplates, setAvailableTemplates] = useState<WorkItemTemplate[]>(
    mergeWorkItemTemplates([]),
  );
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '');
  const [status, setStatus] = useState<WorkflowItemStatus>('inbox');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBrief('');
      setStatus('inbox');
      setProjectId(initialProjectId ?? projects[0]?.id ?? '');
      setSelectedTemplateId('');
      setTemplateFeedback(null);
      return;
    }

    setProjectId(initialProjectId ?? projects[0]?.id ?? '');

    let cancelled = false;

    loadCustomWorkItemTemplates(settingsStore)
      .then((customTemplates) => {
        if (cancelled) {
          return;
        }

        setAvailableTemplates(mergeWorkItemTemplates(customTemplates));
        setTemplateFeedback(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setAvailableTemplates(mergeWorkItemTemplates([]));
        setTemplateFeedback(`Failed to load templates. ${String(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [initialProjectId, open, projects]);

  useEffect(() => {
    if (!projectId && projects[0]?.id) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const defaultAgent = projectId
    ? resolveWorkItemTemplateDefaultAgent(selectedTemplate, projectId, agents)
    : null;
  const isTemplateDefaultAgentUnavailable =
    Boolean(selectedTemplate?.agentId) && !defaultAgent;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[min(92vw,560px)] flex-col overflow-y-auto">
        <DialogTitle>Create work item</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Capture a single unit of work for the current project. Keep the card light;
          add deeper notes and review generated artifacts later in the inspector.
        </DialogDescription>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="create-work-item-template"
            >
              Use template
            </label>
            <select
              className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              id="create-work-item-template"
              onChange={(event) => {
                const nextTemplateId = event.target.value;
                const nextTemplate = availableTemplates.find((template) => template.id === nextTemplateId);

                setSelectedTemplateId(nextTemplateId);

                if (!nextTemplate) {
                  return;
                }

                const prefill = createWorkItemTemplatePrefill(nextTemplate);
                setTitle(prefill.title);
                setBrief(prefill.brief);
              }}
              value={selectedTemplateId}
            >
              <option value="">No template</option>
              {availableTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {templateFeedback ? (
              <p className="text-sm text-rose-200">{templateFeedback}</p>
            ) : selectedTemplate ? (
              <p className="text-sm text-app-muted">
                Creates {selectedTemplate.tasks.length} checklist item{selectedTemplate.tasks.length === 1 ? '' : 's'}
                {defaultAgent ? ` and assigns ${defaultAgent.name}.` : isTemplateDefaultAgentUnavailable
                  ? ' and skips the saved default agent because it does not match this project.'
                  : '.'}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="create-work-item-title"
            >
              Work item title
            </label>
            <input
              className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              id="create-work-item-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Homepage rewrite"
              value={title}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="create-work-item-project"
              >
                Project
              </label>
              <select
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                id="create-work-item-project"
                onChange={(event) => setProjectId(event.target.value)}
                value={projectId}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="create-work-item-status"
              >
                Status
              </label>
              <select
                className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
                id="create-work-item-status"
                onChange={(event) => setStatus(event.target.value as WorkflowItemStatus)}
                value={status}
              >
                {itemStatuses.map((itemStatus) => (
                  <option key={itemStatus} value={itemStatus}>
                    {itemStatus.charAt(0).toUpperCase() + itemStatus.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="create-work-item-brief"
            >
              Brief
            </label>
            <textarea
              className="focus-ring-app min-h-[140px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
              id="create-work-item-brief"
              onChange={(event) => setBrief(event.target.value)}
              placeholder="What should happen here, and why does it matter?"
              value={brief}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-app-border pt-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !projectId}
            onClick={() => {
              if (!projectId) {
                return;
              }

              onCreateItem({
                brief,
                ...(defaultAgent
                  ? {
                      primaryAgentId: defaultAgent.id,
                      primaryAgentName: defaultAgent.name,
                    }
                  : {}),
                projectId,
                status,
                ...(selectedTemplate ? { taskTitles: [...selectedTemplate.tasks] } : {}),
                title,
              });
            }}
            type="button"
          >
            Create work item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
