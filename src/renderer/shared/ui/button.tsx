import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/renderer/shared/lib/utils';

const buttonVariants = cva(
  'focus-ring-app inline-flex items-center justify-center gap-2 rounded-[14px] text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-app-accent text-white hover:bg-app-accent-ink',
        ghost: 'text-app-text hover:bg-app-card',
        outline:
          'border border-app-border bg-transparent text-app-text hover:border-app-border-strong hover:bg-app-card',
        quiet: 'bg-transparent text-app-muted hover:bg-app-card hover:text-app-text',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-10 px-4',
        icon: 'h-9 w-9 rounded-[12px]',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
