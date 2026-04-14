// Create work item dialog UI.

import { useEffect, useState } from 'react';

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

const itemStatuses: WorkflowItemStatus[] = ['inbox', 'ready', 'active', 'review', 'done'];

/** Create work item dialog props. */
interface CreateWorkItemDialogProps {
  initialProjectId: string | null;
  onCreateItem: (input: {
    brief: string;
    projectId: string;
    status: WorkflowItemStatus;
    title: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: WorkflowProject[];
}

/** Renders the create work item dialog UI. */
export function CreateWorkItemDialog({
  initialProjectId,
  onCreateItem,
  onOpenChange,
  open,
  projects,
}: CreateWorkItemDialogProps) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '');
  const [status, setStatus] = useState<WorkflowItemStatus>('inbox');

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBrief('');
      setStatus('inbox');
      setProjectId(initialProjectId ?? projects[0]?.id ?? '');
      return;
    }

    setProjectId(initialProjectId ?? projects[0]?.id ?? '');
  }, [initialProjectId, open, projects]);

  useEffect(() => {
    if (!projectId && projects[0]?.id) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

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
                    {itemStatus[0]!.toUpperCase() + itemStatus.slice(1)}
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
                projectId,
                status,
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
