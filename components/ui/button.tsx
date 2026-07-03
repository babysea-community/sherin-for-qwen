import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium outline-none transition focus-visible:border-fuchsia-300/60 focus-visible:ring-2 focus-visible:ring-fuchsia-300/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-fuchsia-300 text-slate-950 hover:bg-fuchsia-200',
        outline:
          'border border-white/10 bg-slate-950/60 text-slate-200 hover:border-fuchsia-300/50 hover:text-white',
        ghost: 'text-slate-300 hover:bg-white/5 hover:text-white',
      },
      size: {
        default: 'h-10 px-4 py-2',
        lg: 'h-12 px-5 py-3',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
