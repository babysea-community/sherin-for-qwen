'use server';

import { redirect } from 'next/navigation';

import { getSiteUrl } from '@/lib/utils/env';
import { createSupabaseServerClient } from '@/lib/database/server-actions';

export async function signInWithGoogle() {
  const supabase = await createSupabaseServerClient();
  const redirectTo = new URL('/auth/callback', getSiteUrl());
  redirectTo.searchParams.set('next', '/dashboard/studio');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo.toString(),
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    redirect('/access?error=oauth_failed');
  }

  if (!data.url) {
    redirect('/access?error=oauth_unavailable');
  }

  redirect(data.url);
}
