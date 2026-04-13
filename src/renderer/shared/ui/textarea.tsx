import * as React from 'react';

import { cn } from '@/renderer/shared/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'focus-ring-app min-h-[132px] w-full rounded-[18px] border border-app-border bg-app-panel px-4 py-3 text-sm leading-6 text-app-text caret-app-accent outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    ref={ref}
    {...props}
  />
));

Textarea.displayName = 'Textarea';

export { Textarea };
