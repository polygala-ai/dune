import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';

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
    rootPath: string;
  }) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  onSelectProjectDirectory: () => Promise<string | null>;
  open: boolean;
}

export function CreateProjectDialog({
  onCreateProject,
  onOpenChange,
  onSelectProjectDirectory,
  open,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setRootPath('');
      setErrorMessage(null);
      setIsPickingDirectory(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSelectProjectDirectory = async () => {
    setErrorMessage(null);
    setIsPickingDirectory(true);

    try {
      const selectedDirectory = await onSelectProjectDirectory();

      if (selectedDirectory) {
        setRootPath(selectedDirectory);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPickingDirectory(false);
    }
  };

  const handleCreateProject = async () => {
    if (!name.trim() || !rootPath.trim()) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onCreateProject({
        description,
        name,
        rootPath,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(88vh,720px)] w-[min(92vw,540px)] flex-col">
        <DialogTitle>New project</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Create a steady container for work items and project-owned agents.
        </DialogDescription>

        <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
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
              htmlFor="workflow-project-root-path"
            >
              Project folder
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="workflow-project-root-path"
                placeholder="Choose an existing empty folder"
                readOnly
                value={rootPath}
              />
              <Button
                disabled={isPickingDirectory || isSubmitting}
                onClick={() => {
                  void handleSelectProjectDirectory();
                }}
                type="button"
                variant="outline"
              >
                <FolderOpen className="h-4 w-4" />
                Choose folder
              </Button>
            </div>
            <p className="text-xs leading-5 text-app-muted">
              Dune will keep project artifacts inside this folder. The folder must already exist
              and be empty.
            </p>
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="workflow-project-description"
            >
              Description
            </label>
            <textarea
              className="focus-ring-app min-h-[120px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
              id="workflow-project-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this project is responsible for."
              value={description}
            />
          </div>

          {errorMessage ? (
            <p className="text-sm leading-6 text-red-700">{errorMessage}</p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !rootPath.trim() || isSubmitting}
            onClick={() => {
              void handleCreateProject();
            }}
            type="button"
          >
            {isSubmitting ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
