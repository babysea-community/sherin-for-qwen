'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  InlineDigitalOcean,
  InlineNetlifyLight,
  InlineRailwayLight,
  InlineRenderLight,
  InlineVercelLight,
} from '@/components/icons/inline-host';

const deployLinks = [
  {
    label: 'DigitalOcean',
    href: 'https://cloud.digitalocean.com/apps/new?repo=https://github.com/babysea-community/sherin-for-qwen/tree/main',
    Icon: InlineDigitalOcean,
  },
  {
    label: 'Netlify',
    href: 'https://app.netlify.com/start/deploy?repository=https://github.com/babysea-community/sherin-for-qwen',
    Icon: InlineNetlifyLight,
  },
  {
    label: 'Railway',
    href: 'https://railway.com/deploy/sherin-for-qwen?referralCode=_FJpRb',
    Icon: InlineRailwayLight,
  },
  {
    label: 'Render',
    href: 'https://render.com/deploy?repo=https://github.com/babysea-community/sherin-for-qwen',
    Icon: InlineRenderLight,
  },
  {
    label: 'Vercel',
    href: 'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbabysea-community%2Fsherin-for-qwen&project-name=sherin-for-qwen&repository-name=sherin-for-qwen&env=NEXT_PUBLIC_SITE_URL,OWNER_EMAIL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLIC_KEY,SUPABASE_SECRET_KEY,INFERENCE_PROVIDER,DASHSCOPE_API_KEY,STORAGE_PROVIDER,CUSTOM_USER_STORAGE_QUOTA_GB',
    Icon: InlineVercelLight,
  },
] as const;

export function DeployDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#f0abfc66] px-4 py-3 text-xs font-semibold text-fuchsia-100 transition hover:bg-[#f0abfc1a] sm:px-6 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="true"
      >
        One-click deploy
        <ChevronDown
          className={`size-4 transition duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute z-10 mt-2 w-full rounded-2xl border border-[#20263a] bg-[#0a0f22] p-1.5 shadow-xl shadow-[#00000066]">
          {deployLinks.map((item) => {
            const Icon = item.Icon;
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-[#111833] hover:text-white"
                onClick={() => setOpen(false)}
              >
                <Icon
                  className="h-4 w-auto shrink-0 text-fuchsia-100"
                  aria-hidden="true"
                />
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
