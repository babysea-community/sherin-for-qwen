'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      closeButton
      richColors
      position="top-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'border border-white/10 bg-slate-950 text-slate-100 shadow-2xl',
          description: 'text-slate-400',
        },
      }}
    />
  );
}
