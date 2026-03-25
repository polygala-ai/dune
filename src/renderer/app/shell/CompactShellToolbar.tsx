import { Menu, PanelRight } from 'lucide-react';

import { Button } from '@/renderer/shared/ui/button';

interface CompactShellToolbarProps {
  inspectorToggle?: {
    isOpen: boolean;
    onToggle: () => void;
  };
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function CompactShellToolbar({
  inspectorToggle,
  isSidebarOpen,
  onToggleSidebar,
}: CompactShellToolbarProps) {
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-app-border px-4 py-3"
      data-testid="compact-shell-toolbar"
    >
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
      ) : (
        <div className="h-9 w-9" />
      )}
    </div>
  );
}
