// Tool analytics workspace shell.

import { CompactShellToolbar } from '@/renderer/app/shell/CompactShellToolbar';
import { ToolAnalyticsPanel } from '@/renderer/components/ToolAnalyticsPanel';

/** Tool analytics workspace props. */
interface ToolAnalyticsWorkspaceProps {
  isCompactShell: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  showCompactSidebarToggle: boolean;
}

/** Renders the tool analytics workspace UI. */
export function ToolAnalyticsWorkspace({
  isCompactShell,
  isSidebarOpen,
  onToggleSidebar,
  showCompactSidebarToggle,
}: ToolAnalyticsWorkspaceProps) {
  return (
    <>
      {isCompactShell ? (
        <CompactShellToolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showSidebarToggle={showCompactSidebarToggle}
        />
      ) : null}

      <ToolAnalyticsPanel />
    </>
  );
}
