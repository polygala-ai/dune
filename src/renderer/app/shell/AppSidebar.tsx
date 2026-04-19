// App sidebar UI.

import {
  Blocks,
  Command,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';

import type { AppRoute } from '@/renderer/app/store/types';
import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';
import { Separator } from '@/renderer/shared/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/shared/ui/tooltip';
import { AgentActivityPanel } from '@/renderer/features/agents/components/AgentActivityPanel';

/** Workflow sidebar state. */
interface WorkflowSidebarState {
  onCreateProject: () => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  onSelectProject: (projectId: string) => void;
  projects: WorkflowProject[];
  selectedProjectId: string | null;
}

/** App sidebar props. */
interface AppSidebarProps {
  className?: string;
  isCommandOpen: boolean;
  onOpenCommand: () => void;
  route: AppRoute;
  showQuickSwitch?: boolean;
  workflow: WorkflowSidebarState;
}

/** Renders the app sidebar UI. */
export function AppSidebar({
  className,
  isCommandOpen,
  onOpenCommand,
  route,
  showQuickSwitch = true,
  workflow,
}: AppSidebarProps) {
  const {
    isMac,
    modifierLabel,
  } = useDesktopPlatform();

  return (
    <aside
      className={cn(
        'panel-reveal flex min-h-0 flex-col overflow-hidden px-3 pb-4 pt-4',
        className,
      )}
      data-platform-inset={isMac ? 'mac' : 'none'}
      data-testid="app-sidebar"
    >
      <div className="px-2 pb-4">
        <div
          className={cn(
            'flex items-center justify-between gap-3',
            !showQuickSwitch && 'min-h-9',
          )}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">
            <Sparkles className="h-3 w-3" />
            Dune
          </div>

          {showQuickSwitch ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Open quick switcher"
                  onClick={onOpenCommand}
                  size="icon"
                  type="button"
                  variant={isCommandOpen ? 'quiet' : 'outline'}
                >
                  <Command className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{modifierLabel}K quick switch</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="mt-5 space-y-1">
          <button
            aria-current={route === 'plugins' ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm font-medium transition-colors',
              route === 'plugins'
                ? 'bg-app-accent-soft text-app-text'
                : 'text-app-text hover:bg-app-card',
            )}
            onClick={workflow.onOpenPlugins}
            type="button"
          >
            <Blocks className="h-4 w-4 shrink-0 text-app-muted" />
            <span>Plugins</span>
          </button>
        </div>
      </div>

      <Separator />

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-1">
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            Projects
          </div>
          <Button
            aria-label="Create project"
            onClick={workflow.onCreateProject}
            size="icon"
            type="button"
            variant="quiet"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 pr-1" contentWidth="fill">
          <div className="space-y-1 pr-2">
            {workflow.projects.map((project) => {
              const isSelected = workflow.selectedProjectId === project.id;

              return (
                <button
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={project.name}
                  className={cn(
                    'block w-full overflow-hidden rounded-[14px] px-3 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'bg-app-accent-soft text-app-text'
                      : 'text-app-text hover:bg-app-card',
                  )}
                  data-active-style={isSelected ? 'fill' : 'idle'}
                  key={project.id}
                  onClick={() => workflow.onSelectProject(project.id)}
                  type="button"
                >
                  <div className="flex min-w-0 items-baseline">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-app-text">
                      {project.name}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-[12px] leading-5 text-app-muted">
                    {project.description || 'Project'}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      <AgentActivityPanel />

      <Separator />

      <div className="shrink-0 px-1 pt-4">
        <button
          aria-current={route === 'settings' ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm font-medium transition-colors',
            route === 'settings'
              ? 'bg-app-accent-soft text-app-text'
              : 'text-app-text hover:bg-app-card',
          )}
          onClick={workflow.onOpenSettings}
          type="button"
        >
          <Settings2 className="h-4 w-4 shrink-0 text-app-muted" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
