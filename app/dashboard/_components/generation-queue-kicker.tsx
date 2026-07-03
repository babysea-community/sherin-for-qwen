'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const QUEUE_KICK_INTERVAL_MS = 10_000;
const ACTIVE_REFRESH_INTERVAL_MS = 2500;
let queueKickInFlight = false;

export function GenerationQueueKicker({
  enabled,
  refresh = false,
}: {
  enabled: boolean;
  refresh?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const kickQueue = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      if (queueKickInFlight) {
        return;
      }

      queueKickInFlight = true;

      void fetch('/api/generations/process', {
        cache: 'no-store',
        credentials: 'same-origin',
        method: 'POST',
      })
        .catch(() => undefined)
        .finally(() => {
          queueKickInFlight = false;
        });
    };
    const refreshPage = () => {
      if (refresh && document.visibilityState === 'visible') {
        router.refresh();
      }
    };

    kickQueue();

    const kickInterval = window.setInterval(kickQueue, QUEUE_KICK_INTERVAL_MS);
    const refreshInterval = refresh
      ? window.setInterval(refreshPage, ACTIVE_REFRESH_INTERVAL_MS)
      : null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        kickQueue();
        refreshPage();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(kickInterval);

      if (refreshInterval) {
        window.clearInterval(refreshInterval);
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, refresh, router]);

  return null;
}
