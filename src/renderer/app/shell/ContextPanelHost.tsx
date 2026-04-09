import type { HTMLAttributes } from 'react';
import { X } from 'lucide-react';

import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';

import type { PresentedAgent } from '@/renderer/features/agents/types';

interface ContextPanelHostProps {
  agent: PresentedAgent | null;
  inlineResizeHandleProps?: HTMLAttributes<HTMLDivElement>;
  isInlineResizing?: boolean;
  mode: 'hidden' | 'inline' | 'overlay';
  onClose: () => void;
  onDeleteAgent?: () => Promise<void> | void;
}

export function ContextPanelHost({
  agent,
  inlineResizeHandleProps,
  isInlineResizing = false,
  mode,
  onClose,
  onDeleteAgent,
}: ContextPanelHostProps) {
  const deleteAgentProps = onDeleteAgent ? { onDeleteAgent } : {};

  if (mode === 'hidden' || !agent) {
    return null;
  }

  if (mode === 'inline') {
    return (
      <div className="relative min-h-0 min-w-0">
        {inlineResizeHandleProps ? (
          <div
            {...inlineResizeHandleProps}
            className="context-panel-resize-handle"
            data-resizing={isInlineResizing}
          />
        ) : null}
        <AgentContextPanel
          agent={agent}
          className="h-full border-l border-app-border"
          onClose={onClose}
          {...deleteAgentProps}
        />
      </div>
    );
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent
        className="shell-context-drawer"
        data-dialog-motion="drawer"
        overlayProps={{
          'data-testid': 'context-panel-overlay',
          onClick: onClose,
        }}
      >
        <DialogTitle className="sr-only">Agent inspector</DialogTitle>
        <DialogDescription className="sr-only">
          Inspect the current agent workspace.
        </DialogDescription>
        <DialogClose asChild>
          <Button
            aria-label="Close context panel"
            className="absolute right-4 top-4 z-10"
            size="icon"
            type="button"
            variant="quiet"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogClose>
        <AgentContextPanel
          agent={agent}
          className="app-no-drag h-full"
          onClose={onClose}
          showCloseButton={false}
          {...deleteAgentProps}
        />
      </DialogContent>
    </Dialog>
  );
}
