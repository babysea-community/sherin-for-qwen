'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export type StudioToast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning';
};

export function StudioToasts({ toasts }: { toasts: StudioToast[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shownToastIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let shouldClearCreatedParam = false;

    for (const item of toasts) {
      const oneShotToast = item.id.startsWith('studio-created-');

      if (!oneShotToast || !shownToastIdsRef.current.has(item.id)) {
        toast[item.type](item.message, { id: item.id });
      }

      if (oneShotToast) {
        shownToastIdsRef.current.add(item.id);
        shouldClearCreatedParam = true;
      }
    }

    if (!shouldClearCreatedParam || !searchParams.has('created')) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete('created');

    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams, toasts]);

  return null;
}
