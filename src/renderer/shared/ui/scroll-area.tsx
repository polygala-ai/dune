// Scroll area UI primitive.

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/renderer/shared/lib/utils';

/** Scroll area props. */
interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  contentWidth?: 'auto' | 'fill';
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ children, className, contentWidth = 'auto', ...props }, ref) => {
  // Radix injects an inner content wrapper that otherwise sizes to max-content width.
  const viewportClassName = cn(
    'h-full w-full rounded-[inherit]',
    contentWidth === 'fill' && '[&>div]:!block [&>div]:!min-w-full',
  );

  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative h-full overflow-hidden', className)}
      ref={ref}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className={viewportClassName}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    className={cn(
      'flex touch-none select-none rounded-full p-[2px] transition-colors',
      orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 flex-col',
      className,
    )}
    orientation={orientation}
    ref={ref}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-app-border-strong" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
