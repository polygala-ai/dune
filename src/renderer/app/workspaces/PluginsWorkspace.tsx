import { Blocks } from 'lucide-react';

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';

interface PluginsWorkspaceProps {
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  showCompactSidebarToggle: boolean;
}

export function PluginsWorkspace({
  isCompactShell,
  isSidebarOpen,
  onToggleSidebar,
  showCompactSidebarToggle,
}: PluginsWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showSidebarToggle={showCompactSidebarToggle}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
        <div className="flex items-center justify-between gap-4 border-b border-app-border pb-5">
          <div>
            <div className="surface-eyebrow">Plugins</div>
            <h2 className="surface-title">Plugins</h2>
            <p className="surface-description">
              Plugins will appear here once the project shell is ready to host them.
            </p>
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 items-center justify-center">
          <section className="w-full max-w-[540px] rounded-[28px] border border-dashed border-app-border bg-app-panel/70 px-8 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-app-card text-app-muted">
              <Blocks className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-[1.3rem] font-semibold tracking-[-0.04em] text-app-text">
              No plugins yet
            </h3>
            <p className="mt-3 text-sm leading-6 text-app-muted">
              This space is reserved for project plugins. For now, it stays empty on purpose.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
