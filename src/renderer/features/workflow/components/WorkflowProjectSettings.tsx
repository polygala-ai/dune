import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { Separator } from '@/renderer/shared/ui/separator';

interface WorkflowProjectSettingsProps {
  className?: string;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (input: { description: string; name: string }) => void;
  project: WorkflowProject;
}

export function WorkflowProjectSettings({
  className,
  onCancel,
  onDelete,
  onSave,
  project,
}: WorkflowProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
  }, [project.description, project.id, project.name]);

  const isSaveDisabled = useMemo(() => {
    const trimmedName = name.trim();

    return !trimmedName || (
      trimmedName === project.name &&
      description.trim() === project.description
    );
  }, [description, name, project.description, project.name]);

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
          disabled={isSaveDisabled}
          onClick={() => {
            onSave({
              description,
              name,
            });
          }}
          type="button"
        >
          Save
        </Button>
      </div>
    </aside>
  );
}
