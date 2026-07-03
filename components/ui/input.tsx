import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus-visible:border-fuchsia-300/60 focus-visible:ring-2 focus-visible:ring-fuchsia-300/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-rose-300/60 aria-invalid:ring-rose-300/10',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
