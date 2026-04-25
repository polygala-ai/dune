// Templates settings UI.

import { useEffect, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

import { createId } from '@/shared/id';
import type {
  TemplateScopedAgent,
  WorkItemTemplate,
} from '@/shared/workflow/work-item-templates';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Input } from '@/renderer/shared/ui/input';
import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import {
  loadCustomWorkItemTemplates,
  mergeWorkItemTemplates,
  parseImportedWorkItemTemplates,
  saveCustomWorkItemTemplates,
  serializeCustomWorkItemTemplates,
  upsertImportedWorkItemTemplates,
} from '@/renderer/features/settings/model/work-item-templates';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';
import { isBuiltInWorkItemTemplateId } from '@/shared/workflow/work-item-templates';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const STORE_NAME = 'settings';

type FeedbackState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | null;

interface TemplateDialogState {
  mode: 'create' | 'edit';
  template: WorkItemTemplate | null;
}

interface TemplateFormDialogProps {
  agents: TemplateScopedAgent[];
  onOpenChange: (open: boolean) => void;
  onSave: (template: WorkItemTemplate) => void;
  open: boolean;
  state: TemplateDialogState | null;
}

function createSettingsStore() {
  return {
    get: async <T,>(key: string): Promise<T | null> => {
      const value = await window.duneDesktop?.storageGet?.(STORE_NAME, key);
      return (value as T | null | undefined) ?? null;
    },
    set: async <T,>(key: string, value: T) => {
      await window.duneDesktop?.storageSet?.(STORE_NAME, key, value);
    },
  };
}

const settingsStore = createSettingsStore();

function describeTemplateAgent(
  agents: TemplateScopedAgent[],
  defaultAgentId: string | undefined,
) {
  if (!defaultAgentId) {
    return 'No default agent';
  }

  return agents.find((agent) => agent.id === defaultAgentId || agent.name === defaultAgentId)?.name
    ?? `Unknown agent (${defaultAgentId})`;
}

function buildAgentOptions(
  agents: TemplateScopedAgent[],
  defaultAgentId: string | undefined,
) {
  const knownAgentRefs = new Set(agents.flatMap((agent) => [agent.id, agent.name]));
  const nextOptions = [...agents].sort((left, right) => left.name.localeCompare(right.name));

  if (defaultAgentId && !knownAgentRefs.has(defaultAgentId)) {
    nextOptions.push({
      id: defaultAgentId,
      name: `Unknown agent (${defaultAgentId})`,
      projectId: null,
    });
  }

  return nextOptions;
}

function TemplateFormDialog({
  agents,
  onOpenChange,
  onSave,
  open,
  state,
}: TemplateFormDialogProps) {
  const [brief, setBrief] = useState('');
  const [defaultAgentId, setDefaultAgentId] = useState('');
  const [name, setName] = useState('');
  const [rawTasks, setRawTasks] = useState('');
  const [titlePattern, setTitlePattern] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setBrief(state?.template?.brief ?? '');
    setDefaultAgentId(state?.template?.defaultAgentId ?? '');
    setName(state?.template?.name ?? '');
    setRawTasks(state?.template?.defaultTasks.join('\n') ?? '');
    setTitlePattern(state?.template?.titlePattern ?? '');
  }, [open, state]);

  const canSave = Boolean(name.trim());
  const dialogTitle = state?.mode === 'edit' ? 'Edit template' : 'Create template';
  const agentOptions = buildAgentOptions(agents, defaultAgentId || state?.template?.defaultAgentId);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[min(92vw,620px)] flex-col overflow-y-auto">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Save a reusable blueprint for work item titles, briefs, checklist steps, and an optional
          default assignee.
        </DialogDescription>

        <div className="mt-6 space-y-4">
          {state?.mode === 'edit' && state.template ? (
            <div className="rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
              Template ID: <span className="font-mono text-[12px] text-app-text">{state.template.id}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="template-name"
            >
              Template name
            </label>
            <Input
              autoFocus
              id="template-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Research task"
              value={name}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="template-title-pattern"
            >
              Title pattern
            </label>
            <Input
              id="template-title-pattern"
              onChange={(event) => setTitlePattern(event.target.value)}
              placeholder="Research: "
              value={titlePattern}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="template-brief"
            >
              Brief
            </label>
            <textarea
              className="focus-ring-app min-h-[160px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
              id="template-brief"
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Research question/topic:"
              value={brief}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="template-default-tasks"
            >
              Default checklist
            </label>
            <textarea
              className="focus-ring-app min-h-[132px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2"
              id="template-default-tasks"
              onChange={(event) => setRawTasks(event.target.value)}
              placeholder={'Define scope\nGather sources\nWrite summary'}
              value={rawTasks}
            />
            <p className="text-sm text-app-muted">One checklist item per line.</p>
          </div>

          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="template-default-agent"
            >
              Default agent
            </label>
            <select
              className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
              id="template-default-agent"
              onChange={(event) => setDefaultAgentId(event.target.value)}
              value={defaultAgentId}
            >
              <option value="">No default agent</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-app-border pt-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              const existingTemplate = state?.template;
              const nextTemplate: WorkItemTemplate = {
                brief,
                defaultTasks: normalizeWorkflowTaskTitles(rawTasks.split('\n')),
                id: existingTemplate?.id ?? createId('template'),
                name: name.trim(),
                titlePattern,
              };

              if (defaultAgentId.trim()) {
                nextTemplate.defaultAgentId = defaultAgentId.trim();
              }

              onSave(nextTemplate);
            }}
            type="button"
          >
            Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Renders the templates settings UI. */
export function TemplatesSettings(props: SettingsSectionComponentProps) {
  const scopedAgents: TemplateScopedAgent[] = props.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    projectId: agent.projectId,
  }));
  const [customTemplates, setCustomTemplates] = useState<WorkItemTemplate[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [isImporting, setImporting] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [dialogState, setDialogState] = useState<TemplateDialogState | null>(null);

  useEffect(() => {
    loadCustomWorkItemTemplates(settingsStore)
      .then((templates) => {
        setCustomTemplates(templates);
      })
      .catch((error) => {
        setFeedback({
          kind: 'error',
          message: `Failed to load templates. ${String(error)}`,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const templates = mergeWorkItemTemplates(customTemplates);
  const builtInTemplates = templates.filter((template) => isBuiltInWorkItemTemplateId(template.id));
  const userTemplates = templates.filter((template) => !isBuiltInWorkItemTemplateId(template.id));

  const persistTemplates = async (nextTemplates: WorkItemTemplate[], successMessage: string) => {
    const savedTemplates = await saveCustomWorkItemTemplates(settingsStore, nextTemplates);

    setCustomTemplates(savedTemplates);
    setFeedback({
      kind: 'success',
      message: successMessage,
    });
  };

  const handleTemplateSave = async (template: WorkItemTemplate) => {
    const nextTemplates = dialogState?.mode === 'edit'
      ? customTemplates.map((candidate) => (candidate.id === template.id ? template : candidate))
      : [...customTemplates, template];

    try {
      await persistTemplates(
        nextTemplates,
        dialogState?.mode === 'edit'
          ? `Updated template “${template.name}”.`
          : `Created template “${template.name}”.`,
      );
      setDialogOpen(false);
      setDialogState(null);
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to save template. ${String(error)}`,
      });
    }
  };

  const handleTemplateDelete = async (template: WorkItemTemplate) => {
    try {
      await persistTemplates(
        customTemplates.filter((candidate) => candidate.id !== template.id),
        `Deleted template “${template.name}”.`,
      );
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to delete template. ${String(error)}`,
      });
    }
  };

  const handleExport = async () => {
    if (typeof window.duneDesktop?.exportWorkItemTemplates !== 'function') {
      setFeedback({
        kind: 'error',
        message: 'Template export is not available in this environment.',
      });
      return;
    }

    setExporting(true);
    setFeedback(null);

    try {
      const savedPath = await window.duneDesktop.exportWorkItemTemplates(
        'dune-work-item-templates.json',
        serializeCustomWorkItemTemplates(customTemplates),
      );

      if (!savedPath) {
        return;
      }

      setFeedback({
        kind: 'success',
        message: `Exported ${customTemplates.length} custom template${customTemplates.length === 1 ? '' : 's'} to ${savedPath}.`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to export templates. ${String(error)}`,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (typeof window.duneDesktop?.importWorkItemTemplates !== 'function') {
      setFeedback({
        kind: 'error',
        message: 'Template import is not available in this environment.',
      });
      return;
    }

    setImporting(true);
    setFeedback(null);

    try {
      const importedJson = await window.duneDesktop.importWorkItemTemplates();

      if (!importedJson) {
        return;
      }

      const importedTemplates = parseImportedWorkItemTemplates(importedJson);

      if (importedTemplates.length === 0) {
        setFeedback({
          kind: 'success',
          message: 'Imported file did not contain any custom templates.',
        });
        return;
      }

      await persistTemplates(
        upsertImportedWorkItemTemplates(customTemplates, importedTemplates),
        `Imported ${importedTemplates.length} custom template${importedTemplates.length === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: `Failed to import templates. ${String(error)}`,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        description="Save reusable work item blueprints with title patterns, starter briefs, checklist steps, and optional default agents."
        eyebrow="Templates"
        title="Work item templates"
      />

      <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm text-app-muted">
        Built-in templates are always available. Import and export only include custom templates.
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setDialogState({ mode: 'create', template: null });
            setDialogOpen(true);
          }}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Create template
        </Button>
        <Button disabled={isExporting} onClick={() => void handleExport()} type="button" variant="outline">
          <Download className="h-4 w-4" />
          Export custom JSON
        </Button>
        <Button disabled={isImporting} onClick={() => void handleImport()} type="button" variant="outline">
          <Upload className="h-4 w-4" />
          Import JSON
        </Button>
      </div>

      {feedback ? (
        <div
          className={cn(
            'mt-4 rounded-[16px] border px-4 py-3 text-sm',
            feedback.kind === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-app-text">Built-in templates</h3>
            <p className="mt-1 text-sm text-app-muted">Included with Dune and kept read-only.</p>
          </div>
          <div className="grid gap-3">
            {builtInTemplates.map((template) => (
              <article
                className="rounded-[20px] border border-app-border bg-app-panel/50 p-5"
                key={template.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-app-text">{template.name}</h4>
                      <span className="rounded-full border border-app-accent/30 bg-app-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-text">
                        Built-in
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-app-muted">Title prefix: {template.titlePattern || 'None'}</p>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-app-text">
                  {template.brief || 'No default brief.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {template.defaultTasks.map((task) => (
                    <span
                      className="rounded-full border border-app-border bg-app-card px-3 py-1 text-xs text-app-muted"
                      key={task}
                    >
                      {task}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-app-text">Custom templates</h3>
            <p className="mt-1 text-sm text-app-muted">Editable templates saved in local settings.</p>
          </div>
          {isLoading ? (
            <div className="rounded-[20px] border border-app-border bg-app-panel/50 px-5 py-4 text-sm text-app-muted">
              Loading templates…
            </div>
          ) : userTemplates.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-app-border bg-app-panel/40 px-5 py-6 text-sm text-app-muted">
              No custom templates yet. Create one to save your own work item blueprint.
            </div>
          ) : (
            <div className="grid gap-3">
              {userTemplates.map((template) => (
                <article
                  className="rounded-[20px] border border-app-border bg-app-panel/50 p-5"
                  key={template.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-app-text">{template.name}</h4>
                      <p className="mt-2 text-sm text-app-muted">Title prefix: {template.titlePattern || 'None'}</p>
                      <p className="mt-1 text-sm text-app-muted">
                        Default agent: {describeTemplateAgent(scopedAgents, template.defaultAgentId)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          setDialogState({ mode: 'edit', template });
                          setDialogOpen(true);
                        }}
                        type="button"
                        variant="quiet"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        onClick={() => {
                          void handleTemplateDelete(template);
                        }}
                        type="button"
                        variant="quiet"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-app-text">
                    {template.brief || 'No default brief.'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {template.defaultTasks.length > 0 ? template.defaultTasks.map((task) => (
                      <span
                        className="rounded-full border border-app-border bg-app-card px-3 py-1 text-xs text-app-muted"
                        key={task}
                      >
                        {task}
                      </span>
                    )) : (
                      <span className="text-sm text-app-muted">No default checklist items.</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <TemplateFormDialog
        agents={scopedAgents}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setDialogState(null);
          }
        }}
        onSave={(template) => {
          void handleTemplateSave(template);
        }}
        open={isDialogOpen}
        state={dialogState}
      />
    </>
  );
}
