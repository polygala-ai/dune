// Top-left multi-project switcher.

import {
  FormEvent,
  useMemo,
  useEffect,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Archive,
  FolderKanban,
  Plus,
  Trash2,
} from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

interface ProjectSwitcherProps {
  onCreateProject: (name: string) => string | null;
  onSelectProject: (projectId: string) => void;
}

/** Renders a compact multi-project switcher. */
export function ProjectSwitcher({
  onCreateProject,
  onSelectProject,
}: ProjectSwitcherProps) {
  const [draftName, setDraftName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [visibleProjectIds, setVisibleProjectIds] = useState<Set<string> | null>(null);
  const {
    deleteProject,
    items,
    projects,
    selectedProjectId,
  } = useAppStore(
    useShallow((state) => ({
      deleteProject: state.deleteProject,
      items: state.items,
      projects: state.projects,
      selectedProjectId: state.selectedProjectId,
    })),
  );
  const activeItemCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of items) {
      if (item.status === 'done') {
        continue;
      }

      counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
    }

    return counts;
  }, [items]);
  const visibleProjects = useMemo(() => {
    if (!visibleProjectIds) {
      return projects;
    }

    return projects.filter((project) => visibleProjectIds.has(project.id));
  }, [projects, visibleProjectIds]);

  useEffect(() => {
    let isDisposed = false;

    void window.duneDesktop?.projectsList?.().then((descriptors) => {
      if (!isDisposed) {
        setVisibleProjectIds(new Set(descriptors.map((project) => project.id)));
      }
    }).catch(() => {});

    return () => {
      isDisposed = true;
    };
  }, [projects]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setIsCreating(false);
      return;
    }

    const projectId = onCreateProject(name);
    if (projectId) {
      setDraftName('');
      setIsCreating(false);
    }
  };

  return (
    <section className="space-y-2 px-1 pb-4" aria-label="Project switcher">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Projects</span>
        </div>
        <Button
          aria-label="Create project"
          onClick={() => setIsCreating(true)}
          size="icon"
          type="button"
          variant="quiet"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1">
        {visibleProjects.map((project) => {
          const isActive = selectedProjectId === project.id;
          const activeCount = activeItemCounts.get(project.id) ?? 0;
          const canDelete = !items.some((item) => item.projectId === project.id);

          return (
            <div className="group flex items-center gap-1" key={project.id}>
              <button
                aria-current={isActive ? 'page' : undefined}
                aria-label={project.name}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-app-accent-soft text-app-text'
                    : 'text-app-text hover:bg-app-card',
                )}
                onClick={() => {
                  void window.duneDesktop?.projectsSwitch?.(project.id).catch(() => {});
                  onSelectProject(project.id);
                }}
                type="button"
              >
                <span className={cn('min-w-0 flex-1 truncate', isActive && 'font-semibold')}>
                  {project.name}
                </span>
                <span className="min-w-5 shrink-0 rounded-full bg-app-card px-1.5 py-0.5 text-center text-[11px] text-app-muted">
                  {activeCount}
                </span>
              </button>
              <Button
                aria-label={`Archive ${project.name}`}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => {
                  void window.duneDesktop?.projectsArchive?.(project.id).then(() => {
                    setVisibleProjectIds((current) => {
                      const next = new Set(current ?? projects.map((candidate) => candidate.id));
                      next.delete(project.id);
                      return next;
                    });
                  }).catch(() => {});
                }}
                size="icon"
                type="button"
                variant="quiet"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
              {canDelete ? (
                <Button
                  aria-label={`Delete ${project.name}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => {
                    void window.duneDesktop?.projectsDelete?.(project.id).catch(() => {});
                    deleteProject(project.id);
                  }}
                  size="icon"
                  type="button"
                  variant="quiet"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          );
        })}

        {isCreating ? (
          <form className="px-1" onSubmit={handleSubmit}>
            <Input
              autoFocus
              onBlur={() => {
                if (!draftName.trim()) {
                  setIsCreating(false);
                }
              }}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="New project"
              value={draftName}
            />
          </form>
        ) : (
          <button
            aria-label="Create project from switcher"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-app-muted transition-colors hover:bg-app-card hover:text-app-text"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            <span>New project</span>
          </button>
        )}
      </div>
    </section>
  );
}
