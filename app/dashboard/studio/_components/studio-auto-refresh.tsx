'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ACTIVE_REFRESH_INTERVAL_MS = 2500;

export function StudioAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      router.refresh();
    };
    const interval = window.setInterval(refresh, ACTIVE_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, router]);

  return null;
}
