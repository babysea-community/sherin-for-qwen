'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ImagePlus,
  Images,
  UserCircle,
  WandSparkles,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard/studio', label: 'Studio', icon: WandSparkles },
  { href: '/dashboard/gallery', label: 'Gallery', icon: Images },
  { href: '/dashboard/references', label: 'References', icon: ImagePlus },
  { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { href: '/dashboard/profile', label: 'Profile', icon: UserCircle },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

type NavLinksProps = {
  variant?: 'sidebar' | 'mobile';
};

export function NavLinks({ variant = 'sidebar' }: NavLinksProps) {
  const pathname = usePathname();
  const isMobile = variant === 'mobile';

  return (
    <nav
      aria-label="Dashboard navigation"
      className={cn(isMobile ? 'flex gap-2 overflow-x-auto' : 'space-y-1')}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 border text-sm font-medium transition',
              isMobile
                ? 'min-w-fit rounded-xl px-3 py-2'
                : 'rounded-xl px-3 py-2.5',
              isActive
                ? 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100 shadow-[inset_2px_0_0_rgba(240,171,252,0.7)]'
                : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-slate-100',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
