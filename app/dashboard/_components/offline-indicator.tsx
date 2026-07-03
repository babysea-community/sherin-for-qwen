'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Minimal offline indicator. Subscribes to `navigator.onLine` via the
 * `online`/`offline` window events and shows a high-contrast banner when
 * the browser reports it has lost connectivity. Hidden on the server so
 * there's no hydration flash. `role="status"` + `aria-live="polite"` lets
 * screen readers announce the change without stealing focus.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted || online) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-100"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>
        You are offline. Some actions will fail until connectivity returns.
      </span>
    </div>
  );
}
