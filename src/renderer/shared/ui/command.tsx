// Command UI primitive.

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { cn } from '@/renderer/shared/lib/utils';

const commandDialogContentClassName =
  'overflow-hidden border-app-border bg-app-panel-strong p-0';

const commandDialogClassName =
  'flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-app-panel-strong text-app-text';

const commandDialogLayoutClassName =
  '[&_.command-input-wrapper]:h-14 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.22em] [&_[cmdk-group-heading]]:text-app-muted [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:rounded-[16px] [&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:outline-none [&_[cmdk-item][data-selected=true]]:bg-app-accent-soft [&_[cmdk-item][data-selected=true]]:text-app-text [&_[cmdk-list]]:max-h-[420px] [&_[cmdk-list]]:overflow-y-auto [&_[cmdk-list]]:thin-scrollbar [&_[cmdk-separator]]:mx-4 [&_[cmdk-separator]]:h-px [&_[cmdk-separator]]:bg-app-border';

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    className={cn(commandDialogClassName, className)}
    ref={ref}
    {...props}
  />
));

Command.displayName = CommandPrimitive.displayName;

/** Command dialog props. */
interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  children: React.ReactNode;
}

/** Renders the command dialog UI. */
function CommandDialog({ children, ...props }: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className={commandDialogContentClassName}>
        <DialogTitle className="sr-only">Quick switcher</DialogTitle>
        <DialogDescription className="sr-only">
          Search actions and agents.
        </DialogDescription>
        <Command className={commandDialogLayoutClassName}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="command-input-wrapper flex items-center border-b border-app-border px-4">
    <CommandPrimitive.Input
      className={cn(
        'flex h-12 w-full bg-transparent text-sm text-app-text outline-none placeholder:text-app-muted disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    className={cn('max-h-[420px] overflow-y-auto', className)}
    ref={ref}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    className="px-4 py-10 text-center text-sm text-app-muted"
    ref={ref}
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    className={cn('overflow-hidden p-1 text-app-text', className)}
    ref={ref}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    className={cn('mx-2 h-px bg-app-border', className)}
    ref={ref}
    {...props}
  />
));

CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    className={cn(
      'flex cursor-default select-none items-center gap-3 text-sm text-app-text data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

/** Renders the command shortcut UI. */
function CommandShortcut({
  children,
  className,
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ml-auto font-mono text-[11px] uppercase tracking-[0.2em] text-app-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
