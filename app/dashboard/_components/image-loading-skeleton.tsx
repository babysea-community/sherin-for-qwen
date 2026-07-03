import { cn } from '@/lib/utils';

export function ImageLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden bg-slate-950', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 animate-pulse bg-white/[0.045]" />
      <div className="absolute inset-x-4 bottom-4 space-y-2">
        <div className="h-2 w-2/3 rounded-full bg-white/10" />
        <div className="h-2 w-1/3 rounded-full bg-white/[0.07]" />
      </div>
    </div>
  );
}
