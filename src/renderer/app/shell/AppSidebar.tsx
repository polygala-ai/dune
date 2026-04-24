// App sidebar UI.

import {
  Blocks,
  Command,
  Settings2,
  Sparkles,
} from 'lucide-react';

import type { AppRoute } from '@/renderer/app/store/types';
import type { WorkflowProject } from '@/renderer/features/workflow/types';
import { ProjectSwitcher } from '@/renderer/features/projects/ProjectSwitcher';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import { Separator } from '@/renderer/shared/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/shared/ui/tooltip';

/** Workflow sidebar state. */
interface WorkflowSidebarState {
  onCreateProject: () => void;
  onCreateProjectFromName: (name: string) => string | null;
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
          <ProjectSwitcher
            onCreateProject={workflow.onCreateProjectFromName}
            onSelectProject={workflow.onSelectProject}
          />

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

      <div className="mt-6 min-h-0 flex-1" />

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
