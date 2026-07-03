import type { Metadata } from 'next';
import { GooBackground } from '@/lib/utils/goo/background';
import { InlineGoogle } from '@/components/icons/inline-oauth';
import { signInWithGoogle } from './_lib/server-actions';

export const metadata: Metadata = {
  title: 'Owner Access',
  description: 'Sign in to your private workspace.',
  robots: { index: false, follow: false },
};

const ACCESS_ERROR_COPY: Record<string, string> = {
  oauth_unavailable: 'Google sign-in is not configured. Check OAuth setup.',
  oauth_failed: 'Google sign-in could not start. Try again.',
  callback_invalid:
    'Google sign-in callback is invalid or expired. Try signing in again.',
  not_owner:
    'This Google account is not the configured workspace owner. Access denied.',
};

const ACCESS_MESSAGE_COPY: Record<string, string> = {
  signed_out: 'You have been signed out.',
};

type AccessPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const errorCopy = params?.error ? ACCESS_ERROR_COPY[params.error] : undefined;
  const messageCopy = params?.message
    ? ACCESS_MESSAGE_COPY[params.message]
    : undefined;

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 py-12">
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <GooBackground />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-8 shadow-2xl shadow-black/70 ring-1 ring-white/10">
        <div className="mb-8 text-center">
          <p className="text-lg font-semibold uppercase tracking-[0.4em] text-fuchsia-200">
            Sherin
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-white">
            Owner access
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Sherin is a single-user workspace. Only the email configured in
            <code className="mx-1 rounded bg-white/10 px-1 text-fuchsia-100">
              OWNER_EMAIL
            </code>
            can sign in.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Build your own Sherin{' '}
            <a
              href="https://github.com/babysea-community/sherin-for-qwen"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fuchsia-200 underline decoration-fuchsia-200/40 underline-offset-4 transition hover:text-fuchsia-100 hover:decoration-fuchsia-100"
            >
              here
            </a>
            .
          </p>
        </div>

        {messageCopy ? (
          <div className="mb-4 rounded-2xl border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-3 text-sm text-fuchsia-50">
            {messageCopy}
          </div>
        ) : null}

        {errorCopy ? (
          <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorCopy}
          </div>
        ) : null}

        <form action={signInWithGoogle} className="space-y-4">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-100"
          >
            <InlineGoogle aria-hidden="true" className="h-5 w-5" />
            Continue with Google
          </button>
          <p className="text-center text-xs leading-5 text-slate-500">
            Sign-ins from any other email are rejected.
          </p>
        </form>
      </div>
    </main>
  );
}
