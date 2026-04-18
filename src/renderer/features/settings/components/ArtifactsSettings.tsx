// Artifacts settings UI.

import { FileText, FolderOpen } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { Button } from '@/renderer/shared/ui/button';

import { SettingsSectionIntro } from './SettingsSectionIntro';

/** Opens file. */
function openFile(filePath: string) {
  void window.duneDesktop?.openPath?.(filePath);
}

/** Renders the artifacts settings UI. */
export function ArtifactsSettings({ runtimeInfo }: SettingsSectionComponentProps) {
  const artifactsPath = runtimeInfo.artifactsPath;

  if (!artifactsPath) {
    return (
      <>
        <SettingsSectionIntro
          eyebrow="Artifacts"
          title="Agent templates"
        />
        <p className="mt-4 text-sm text-app-muted">
          Artifacts are unavailable in this runtime mode.
        </p>
      </>
    );
  }

  const files = [
    {
      name: 'dune-main-agent-instructions.md',
      title: 'Project-main agent instructions',
      description: 'System prompt for the lead coordinator agent. Handles triage, delegation, and project oversight.',
    },
    {
      name: 'dune-agent-instructions.md',
      title: 'Worker agent instructions',
      description: 'System prompt for custom agents. Focused on executing assignments and reporting progress.',
    },
    {
      name: 'dune-project-guide.md',
      title: 'Project guide template',
      description: 'Mounted as CLAUDE.md inside agent containers. Uses {{projectId}}, {{ipcMountPath}}, etc.',
    },
  ];

  return (
    <>
      <SettingsSectionIntro
        eyebrow="Artifacts"
        title="Agent templates"
        description="Markdown files that shape how agents behave. Edit to customize agent instructions and IPC guides."
      />

      <div className="mt-6 space-y-4">
        {files.map((file) => (
          <section
            key={file.name}
            className="rounded-[18px] border border-app-border bg-app-panel/40 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-app-text">{file.title}</h3>
                <p className="mt-1 text-sm leading-6 text-app-muted">{file.description}</p>
                <code className="mt-2 block text-xs text-app-muted/70">
                  {artifactsPath}/{file.name}
                </code>
              </div>
              <Button
                className="shrink-0"
                onClick={() => openFile(`${artifactsPath}/${file.name}`)}
                type="button"
                variant="outline"
              >
                <FileText className="h-4 w-4" />
                Open in editor
              </Button>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4">
        <Button
          onClick={() => openFile(artifactsPath)}
          type="button"
          variant="ghost"
        >
          <FolderOpen className="h-4 w-4" />
          Open artifacts folder
        </Button>
      </div>
    </>
  );
}
