import * as React from 'react';

import { cn } from '@/renderer/shared/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        'flex h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors placeholder:text-app-muted focus-visible:border-app-border-strong focus-visible:ring-2 focus-visible:ring-app-accent/30 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

export { Input };
