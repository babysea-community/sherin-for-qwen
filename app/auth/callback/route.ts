import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';

import { isOwnerEmail } from '@/lib/auth/owner';
import { getSiteUrl, getSupabaseUrl, requireEnv } from '@/lib/utils/env';
import type { Database } from '@/lib/database.types';

const ALLOWED_NEXT_PATHS = new Set([
  '/dashboard',
  '/dashboard/studio',
  '/dashboard/gallery',
  '/dashboard/references',
  '/dashboard/usage',
  '/dashboard/profile',
]);

type PendingCookie = { name: string; value: string; options: CookieOptions };

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl();
  const requestUrl = new URL(request.url);
  const next = normalizeNextPath(siteUrl, requestUrl.searchParams.get('next'));
  const code = requestUrl.searchParams.get('code');

  // Collect the auth cookies emitted by the Supabase client and attach them to
  // the exact response we return. Returning a fresh NextResponse.redirect()
  // does not inherit cookies written through next/headers on every host (e.g.
  // Netlify), which would drop the freshly minted session and bounce the owner
  // back to /access.
  const pendingCookies: PendingCookie[] = [];

  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, siteUrl));

    for (const cookie of pendingCookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  };

  if (!code) {
    return redirectTo('/access?error=callback_invalid');
  }

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLIC_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return redirectTo('/access?error=callback_invalid');
  }

  if (!isOwnerEmail(data.user.email)) {
    // Not the configured owner: revoke the freshly minted session.
    await supabase.auth.signOut();
    return redirectTo('/access?error=not_owner');
  }

  return redirectTo(next);
}

function normalizeNextPath(siteUrl: string, value: string | null) {
  if (!value) {
    return '/dashboard/studio';
  }

  const targetUrl = new URL(value, siteUrl);

  if (
    targetUrl.origin !== new URL(siteUrl).origin ||
    !ALLOWED_NEXT_PATHS.has(targetUrl.pathname)
  ) {
    return '/dashboard/studio';
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}
