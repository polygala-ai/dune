import { Menu, PanelRight } from 'lucide-react';

import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

interface CompactShellToolbarProps {
  inspectorToggle?: {
    isOpen: boolean;
    onToggle: () => void;
  };
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  showSidebarToggle?: boolean;
}

export function CompactShellToolbar({
  inspectorToggle,
  isSidebarOpen,
  onToggleSidebar,
  showSidebarToggle,
}: CompactShellToolbarProps) {
  const { isMac } = useDesktopPlatform();
  const shouldShowSidebarToggle = showSidebarToggle ?? !isMac;

  if (!shouldShowSidebarToggle && !inspectorToggle) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b border-app-border px-4 py-3',
        shouldShowSidebarToggle ? 'justify-between' : 'justify-end',
      )}
      data-testid="compact-shell-toolbar"
    >
      {shouldShowSidebarToggle ? (
        <Button
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          onClick={onToggleSidebar}
          size="icon"
          type="button"
          variant="outline"
        >
          <Menu className="h-4 w-4" />
        </Button>
      ) : null}

      {inspectorToggle ? (
        <Button
          aria-label={inspectorToggle.isOpen ? 'Hide inspector' : 'Show inspector'}
          onClick={inspectorToggle.onToggle}
          size="icon"
          type="button"
          variant="quiet"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      ) : shouldShowSidebarToggle ? (
        <div className="h-9 w-9" />
      ) : null}
    </div>
  );
}
