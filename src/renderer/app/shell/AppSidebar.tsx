import {
  Command,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';

import type { AppRoute } from '@/renderer/app/store/types';
import type { AgentSummary } from '@/renderer/features/agents/types';
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

interface AppSidebarProps {
  agents: AgentSummary[];
  className?: string;
  isCommandOpen: boolean;
  onCreateAgent: () => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onSelectAgent: (agentId: string) => void;
  route: AppRoute;
  selectedAgentId: string | null;
}

export function AppSidebar({
  agents,
  className,
  isCommandOpen,
  onCreateAgent,
  onOpenCommand,
  onOpenSettings,
  onSelectAgent,
  route,
  selectedAgentId,
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">
            <Sparkles className="h-3 w-3" />
            Dune
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Open quick switcher"
                onClick={onOpenCommand}
                size="icon"
                variant={isCommandOpen ? 'quiet' : 'outline'}
              >
                <Command className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{modifierLabel}K quick switch</TooltipContent>
          </Tooltip>
        </div>

        <Button
          className="mt-4 w-full justify-between"
          onClick={onCreateAgent}
          size="sm"
          variant="quiet"
        >
          New agent
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="min-h-0 flex-1 py-3 pr-1" contentWidth="fill">
        <div className="min-w-0 w-full space-y-0.5 pr-2">
          {agents.map((agent) => {
            const isActive =
              route === 'agent' && agent.id === selectedAgentId;

            return (
              <button
                aria-current={isActive}
                data-active-style={isActive ? 'fill' : 'idle'}
                className={cn(
                  'block w-full overflow-hidden rounded-[14px] px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-app-accent-soft text-app-text'
                    : 'text-app-text hover:bg-app-card',
                )}
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                type="button"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-app-text">
                    {agent.name}
                  </p>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-app-muted">
                    {agent.updatedLabel}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12px] leading-5 text-app-muted">
                  {agent.preview}
                </p>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      <Separator />

      <div className="px-2 pt-3">
        <button
          data-active-style={route === 'settings' ? 'fill' : 'idle'}
          className={cn(
            'flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left transition-colors',
            route === 'settings'
              ? 'bg-app-accent-soft text-app-text'
              : 'text-app-text hover:bg-app-card',
          )}
          onClick={onOpenSettings}
          type="button"
        >
          <span className="flex items-center gap-3">
            <Settings2 className="h-4 w-4 text-app-muted" />
            <span className="text-sm font-medium text-app-text">Settings</span>
          </span>
          <span className="pill-key">{modifierLabel},</span>
        </button>
      </div>
    </aside>
  );
}
