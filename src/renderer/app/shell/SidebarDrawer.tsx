// Sidebar drawer UI.

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';

/** Sidebar drawer props. */
interface SidebarDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sidebar: ReactNode;
}

/** Renders the sidebar drawer UI. */
export function SidebarDrawer({
  isOpen,
  onOpenChange,
  sidebar,
}: SidebarDrawerProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="shell-sidebar-drawer p-0" data-dialog-motion="drawer">
        <DialogTitle className="sr-only">App sidebar</DialogTitle>
        <DialogDescription className="sr-only">
          Navigate between plugins, projects, and settings.
        </DialogDescription>
        <DialogClose asChild>
          <Button
            aria-label="Close sidebar"
            className="absolute right-4 top-4 z-10"
            size="icon"
            type="button"
            variant="quiet"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogClose>
        {sidebar}
      </DialogContent>
    </Dialog>
  );
}
