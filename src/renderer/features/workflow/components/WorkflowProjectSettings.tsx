// Workflow project settings UI.

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Copy,
  FolderOpen,
  PanelRight,
  Trash2,
} from 'lucide-react';

import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';

/** Renders the project inspector card UI. */
function ProjectInspectorCard({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-[22px] border p-4',
        tone === 'danger'
          ? 'border-app-border bg-app-panel-strong/80'
          : 'border-app-border bg-app-card/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Renders the project inspector inset UI. */
function ProjectInspectorInset({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-3 rounded-[16px] border border-app-border bg-app-panel/60 px-3 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Workflow project settings props. */
interface WorkflowProjectSettingsProps {
  className?: string;
  onCancel: () => void;
  onDelete: () => void;
  onOpenPath: (targetPath: string) => Promise<void> | void;
  onPickRootPath: () => Promise<string | null>;
  onSave: (input: { description: string; name: string; rootPath?: string | null }) => Promise<void> | void;
  presentation: 'inline' | 'drawer';
  project: WorkflowProject;
}

/** Renders the workflow project settings UI. */
export function WorkflowProjectSettings({
  className,
  onCancel,
  onDelete,
  onOpenPath,
  onPickRootPath,
  onSave,
  presentation,
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

  /** Handles root path pick. */
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

  /** Handles save. */
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

  const isDrawerPresentation = presentation === 'drawer';

  return (
    <aside
      className={cn(
        'panel-reveal flex min-h-0 flex-col overflow-hidden',
        isDrawerPresentation
          ? 'h-full px-3 pb-4 pt-4'
          : 'px-3 pb-4 pt-4',
        className,
      )}
      data-testid="workflow-project-settings-panel"
    >
      <div className="px-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">
              <PanelRight className="h-3 w-3" />
              Inspector
            </div>
          </div>
        </div>

        <div className="mt-6">
          <ProjectInspectorCard>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Project settings
            </div>
            <ProjectInspectorInset className={isDrawerPresentation ? 'space-y-1.5' : 'space-y-2'}>
              <p className="text-sm font-medium text-app-text">{project.name}</p>
              <p className="text-xs leading-5 text-app-muted">
                {project.rootPath ? 'Folder connected' : 'Folder not connected yet'}
              </p>
            </ProjectInspectorInset>
          </ProjectInspectorCard>
        </div>
      </div>

      <div
        className="mt-6 min-h-0 flex flex-1 flex-col"
      >
        <ScrollArea
          className="min-h-0 flex-1"
          contentWidth="fill"
          data-testid="workflow-project-settings-scroll-region"
        >
          <div className={cn('px-2', isDrawerPresentation ? 'space-y-4 pb-4' : 'space-y-4 pb-2')}>
            <section>
              <ProjectInspectorCard>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Metadata
                </div>
                <ProjectInspectorInset className={cn(isDrawerPresentation ? 'space-y-3' : 'space-y-4')}>
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
                      className={cn(
                        'focus-ring-app w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2',
                        isDrawerPresentation ? 'min-h-[112px]' : 'min-h-[160px]',
                      )}
                      id="workflow-project-settings-description"
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="What this project is responsible for."
                      value={description}
                    />
                  </div>

                  {errorMessage ? (
                    <p className="text-sm leading-6 text-red-700">{errorMessage}</p>
                  ) : null}
                </ProjectInspectorInset>
              </ProjectInspectorCard>
            </section>

            <section>
              <ProjectInspectorCard>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Project folder
                </div>
                <ProjectInspectorInset className="space-y-3">
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
                        size="sm"
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
                        size="sm"
                        type="button"
                        variant="quiet"
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
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Choose folder
                    </Button>
                  )}

                  <p
                    className={cn(
                      'text-app-muted',
                      isDrawerPresentation ? 'text-[13px] leading-5' : 'text-sm leading-6',
                    )}
                  >
                    {project.rootPath
                      ? 'This user-owned folder is fixed for this project.'
                      : 'Choose an existing empty folder to enable on-disk project and work-item artifacts.'}
                  </p>
                </ProjectInspectorInset>
              </ProjectInspectorCard>
            </section>

            <section>
              <ProjectInspectorCard tone="danger">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Danger zone
                </div>
                <p className="mt-3 text-sm font-medium text-app-text">Delete this project</p>
                <p className="mt-2 text-sm leading-6 text-app-muted">
                  This will delete the project, its work items, and its project-owned agents.
                </p>
                <Button
                  className="mt-4 border-red-300/60 text-red-700 hover:border-red-400 hover:bg-red-50"
                  onClick={onDelete}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete project
                </Button>
              </ProjectInspectorCard>
            </section>
          </div>
        </ScrollArea>
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center justify-end gap-2 border-t border-app-border bg-app-panel/35',
          isDrawerPresentation ? 'px-4 py-3' : 'px-5 py-4',
        )}
        data-testid="workflow-project-settings-footer"
      >
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
