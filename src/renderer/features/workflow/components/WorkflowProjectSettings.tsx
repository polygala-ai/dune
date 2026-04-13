import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  FolderOpen,
  Trash2,
} from 'lucide-react';

import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { Separator } from '@/renderer/shared/ui/separator';

interface WorkflowProjectSettingsProps {
  className?: string;
  onCancel: () => void;
  onDelete: () => void;
  onOpenPath: (targetPath: string) => Promise<void> | void;
  onPickRootPath: () => Promise<string | null>;
  onSave: (input: { description: string; name: string; rootPath?: string | null }) => Promise<void> | void;
  project: WorkflowProject;
}

export function WorkflowProjectSettings({
  className,
  onCancel,
  onDelete,
  onOpenPath,
  onPickRootPath,
  onSave,
  project,
}: WorkflowProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [rootPath, setRootPath] = useState(project.rootPath ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setRootPath(project.rootPath ?? '');
    setErrorMessage(null);
    setIsPickingFolder(false);
    setIsSaving(false);
  }, [project.description, project.id, project.name, project.rootPath]);

  const isSaveDisabled = useMemo(() => {
    const trimmedName = name.trim();
    const normalizedRootPath = rootPath.trim();

    return !trimmedName || (
      trimmedName === project.name &&
      description.trim() === project.description &&
      normalizedRootPath === (project.rootPath ?? '')
    );
  }, [description, name, project.description, project.name, project.rootPath, rootPath]);

  const handlePickRootPath = async () => {
    setErrorMessage(null);
    setIsPickingFolder(true);

    try {
      const selectedRootPath = await onPickRootPath();

      if (selectedRootPath) {
        setRootPath(selectedRootPath);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      await onSave({
        description,
        name,
        ...(project.rootPath === null && rootPath.trim()
          ? { rootPath: rootPath.trim() }
          : {}),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <aside
      className={cn(
        'panel-reveal flex min-h-0 flex-col overflow-hidden px-3 pb-4 pt-4',
        className,
      )}
      data-testid="workflow-project-settings-panel"
    >
      <div className="px-2 pb-4">
        <div className="surface-eyebrow">Project settings</div>
        <h3 className="mt-5 truncate text-[13px] font-medium text-app-text">
          {project.name}
        </h3>
        <p className="mt-1 text-[12px] leading-5 text-app-muted">
          Update the project metadata without changing its board structure.
        </p>
      </div>

      <Separator />

      <div className="thin-scrollbar mt-6 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="workflow-project-settings-name"
              >
                Project name
              </label>
              <Input
                id="workflow-project-settings-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="workflow-project-settings-root-path"
              >
                Project folder
              </label>
              <div className="space-y-3">
                <Input
                  id="workflow-project-settings-root-path"
                  readOnly
                  value={rootPath}
                />
                {project.rootPath ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => {
                        void onOpenPath(project.rootPath!);
                      }}
                      type="button"
                      variant="outline"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open folder
                    </Button>
                    <Button
                      onClick={() => {
                        void window.duneDesktop?.copyText?.(project.rootPath!);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <Copy className="h-4 w-4" />
                      Copy path
                    </Button>
                  </div>
                ) : (
                  <Button
                    disabled={isPickingFolder || isSaving}
                    onClick={() => {
                      void handlePickRootPath();
                    }}
                    type="button"
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Choose folder
                  </Button>
                )}
                <p className="text-sm leading-6 text-app-muted">
                  {project.rootPath
                    ? 'This user-owned folder is fixed for this project.'
                    : 'Choose an existing empty folder to enable on-disk project and work-item artifacts.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
                htmlFor="workflow-project-settings-description"
              >
                Description
              </label>
              <textarea
                className="focus-ring-app min-h-[160px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
                id="workflow-project-settings-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this project is responsible for."
                value={description}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm leading-6 text-red-700">{errorMessage}</p>
            ) : null}
          </section>

          <section className="rounded-[22px] border border-app-border bg-app-panel-strong/80 p-5">
            <div className="surface-eyebrow">Danger zone</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-app-text">Delete this project</p>
                <p className="mt-1 text-sm leading-6 text-app-muted">
                  This will delete the project, its work items, and its project-owned agents.
                </p>
              </div>
              <Button
                className="border-red-300/60 text-red-700 hover:border-red-400 hover:bg-red-50"
                onClick={onDelete}
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
                Delete project
              </Button>
            </div>
          </section>
        </div>
      </div>

      <Separator className="mt-4" />

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-4">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          disabled={isSaveDisabled || isSaving}
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </aside>
  );
}
