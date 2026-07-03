import type { Metadata } from 'next';

import { getOwnerEmail } from '@/lib/auth/owner';
import { getUser } from '@/lib/database/server-actions';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Owner profile and workspace data.',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const { user } = await getUser();
  const ownerEmail = (() => {
    try {
      return getOwnerEmail();
    } catch {
      return null;
    }
  })();

  const identityProvider =
    (user?.app_metadata?.provider as string | undefined) ?? 'google';
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ?? null;
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ?? null;
  const lastSignIn = user?.last_sign_in_at
    ? formatDate(user.last_sign_in_at)
    : null;
  const createdAt = user?.created_at ? formatDate(user.created_at) : null;

  return (
    <main className="w-full space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-fuchsia-200">
          Profile
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName ?? user?.email ?? 'Owner'}
              width={80}
              height={80}
              className="size-20 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-2xl font-semibold text-fuchsia-200">
              {(user?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
          )}

          <div>
            {fullName ? (
              <p className="text-2xl font-semibold text-white">{fullName}</p>
            ) : null}
            <p className="break-all text-sm text-slate-300">{user?.email}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              Identity: {identityProvider}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Owner email">{ownerEmail ?? 'Not configured'}</Item>
          <Item label="Last sign-in">{lastSignIn ?? '—'}</Item>
          <Item label="Workspace created">{createdAt ?? '—'}</Item>
          <Item label="User id">
            <code className="text-xs text-slate-200">{user?.id}</code>
          </Item>
        </dl>
      </section>
    </main>
  );
}

function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-100">{children}</dd>
    </div>
  );
}
