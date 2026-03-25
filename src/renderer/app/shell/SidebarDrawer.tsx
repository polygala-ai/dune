import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';

interface SidebarDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sidebar: ReactNode;
}

export function SidebarDrawer({
  isOpen,
  onOpenChange,
  sidebar,
}: SidebarDrawerProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="shell-sidebar-drawer">
        <DialogTitle className="sr-only">Conversation sidebar</DialogTitle>
        {sidebar}
      </DialogContent>
    </Dialog>
  );
}
