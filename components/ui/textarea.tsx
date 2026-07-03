import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus-visible:border-fuchsia-300/60 focus-visible:ring-2 focus-visible:ring-fuchsia-300/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-rose-300/60 aria-invalid:ring-rose-300/10',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
