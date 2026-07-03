'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    BabySeaGoo?: {
      render: (elementId: string) => void;
    };
  }
}

const GOO_CONTAINER_ID = 'sherin-goo-background';
const GOO_SCRIPT_SRC =
  'https://cdn.babysea.live/packages/goo/version-1/babysea-goo-1.min.js';

export function GooBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const script = document.createElement('script');

    script.src = GOO_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.BabySeaGoo && containerRef.current) {
        window.BabySeaGoo.render(containerRef.current.id);
      }
    };

    scriptRef.current = script;
    document.body.appendChild(script);

    return () => {
      if (scriptRef.current && document.body.contains(scriptRef.current)) {
        document.body.removeChild(scriptRef.current);
      }

      delete window.BabySeaGoo;
    };
  }, []);

  return (
    <div
      id={GOO_CONTAINER_ID}
      ref={containerRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
