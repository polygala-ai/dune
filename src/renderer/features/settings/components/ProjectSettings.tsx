// Active project settings panel.

import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import type { ProjectSettings as ProjectSettingsShape } from '@/shared/electron/ipc-types';

import { SettingsSectionIntro } from './SettingsSectionIntro';

/** Renders active project settings. */
export function ProjectSettings({
  agents,
}: SettingsSectionComponentProps) {
  const {
    projects,
    selectedProjectId,
    updateProject,
  } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      selectedProjectId: state.selectedProjectId,
      updateProject: state.updateProject,
    })),
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const [settings, setSettings] = useState<ProjectSettingsShape>({
    defaultAgentId: null,
    telegramGroupId: null,
  });

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    let isDisposed = false;
    void window.duneDesktop?.projectsGetSettings?.(selectedProject.id).then((nextSettings) => {
      if (!isDisposed) {
        setSettings(nextSettings);
      }
    }).catch(() => {});

    return () => {
      isDisposed = true;
    };
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <section className="space-y-6">
        <SettingsSectionIntro
          description="Create a project before editing project-level defaults."
          eyebrow="Settings"
          title="Project"
        />
      </section>
    );
  }

  const projectAgents = agents.filter((agent) => agent.projectId === selectedProject.id);
  const updateSettings = (patch: Partial<ProjectSettingsShape>) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    void window.duneDesktop?.projectsUpdateSettings?.(selectedProject.id, nextSettings).catch(() => {});
  };

  return (
    <section className="space-y-6">
      <SettingsSectionIntro
        description="Defaults and external routing for the active project."
        eyebrow="Settings"
        title="Project"
      />

      <div className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-app-text">Name</span>
          <input
            className="h-10 w-full rounded-lg border border-app-border bg-app-panel px-3 text-sm outline-none focus:border-app-accent"
            onChange={(event) => updateProject(selectedProject.id, { name: event.target.value })}
            value={selectedProject.name}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-app-text">Description</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-app-border bg-app-panel px-3 py-2 text-sm outline-none focus:border-app-accent"
            onChange={(event) => updateProject(selectedProject.id, { description: event.target.value })}
            value={selectedProject.description}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-app-text">Default agent</span>
          <select
            className="h-10 w-full rounded-lg border border-app-border bg-app-panel px-3 text-sm outline-none focus:border-app-accent"
            onChange={(event) => updateSettings({ defaultAgentId: event.target.value || null })}
            value={settings.defaultAgentId ?? ''}
          >
            <option value="">No default agent</option>
            {projectAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-app-text">Telegram group ID</span>
          <input
            className="h-10 w-full rounded-lg border border-app-border bg-app-panel px-3 text-sm outline-none focus:border-app-accent"
            onChange={(event) => updateSettings({ telegramGroupId: event.target.value.trim() || null })}
            placeholder="-1001234567890"
            value={settings.telegramGroupId ?? ''}
          />
        </label>
      </div>
    </section>
  );
}
