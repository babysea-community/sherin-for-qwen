import { LogOut, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { isOwnerEmail } from '@/lib/auth/owner';
import { getUser } from '@/lib/database/server-actions';

import { NavLinks } from './_components/nav-links';
import { OfflineIndicator } from './_components/offline-indicator';
import { signOut } from './_lib/server-actions';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await getUser();

  if (!user) {
    redirect('/access');
  }

  if (!isOwnerEmail(user.email)) {
    redirect('/access?error=not_owner');
  }

  const ownerEmail = user.email ?? 'Owner';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OfflineIndicator />
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-slate-950/95 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
            <div className="flex size-9 items-center justify-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Sherin</p>
              <p className="truncate text-xs text-slate-500">Owner workspace</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavLinks variant="sidebar" />
          </div>

          <div className="border-t border-white/10 p-4">
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-300/60 hover:bg-rose-300/10 hover:text-rose-100"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Sherin</p>
                <p className="truncate text-xs text-slate-500">{ownerEmail}</p>
              </div>

              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:border-rose-300/60 hover:bg-rose-300/10 hover:text-rose-100"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </form>
            </div>
            <div className="border-t border-white/10 px-3 py-2">
              <NavLinks variant="mobile" />
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
