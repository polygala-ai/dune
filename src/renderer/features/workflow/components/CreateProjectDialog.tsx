import { useEffect, useState } from 'react';

import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Input } from '@/renderer/shared/ui/input';

interface CreateProjectDialogProps {
  onCreateProject: (input: {
    description: string;
    name: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateProjectDialog({
  onCreateProject,
  onOpenChange,
  open,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(88vh,720px)] w-[min(92vw,540px)] flex-col">
        <DialogTitle>New project</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Create a steady container for work items and project-owned agents.
        </DialogDescription>

        <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="workflow-project-name"
            >
              Project name
            </label>
            <Input
              autoFocus
              id="workflow-project-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Workflow Studio"
              value={name}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="workflow-project-description"
            >
              Description
            </label>
            <textarea
              className="min-h-[120px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2 focus-visible:ring-app-accent/30"
              id="workflow-project-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this project is responsible for."
              value={description}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onCreateProject({
                description,
                name,
              });
            }}
            type="button"
          >
            Create project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
