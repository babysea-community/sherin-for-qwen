'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/database/server-actions';

/**
 * Server Action sign-out. Next.js Server Actions are POST-only and ship
 * with a built-in CSRF guard: the framework rejects any invocation whose
 * `Origin` header does not match the request `Host`. Combined with the
 * Supabase auth cookie being `SameSite=Lax`, that gives us defense in depth
 * against cross-site sign-out without an additional CSRF token in the form.
 *
 * We use `scope: 'local'` so that signing out of this tab does not
 * invalidate the owner's session on other devices (e.g. mobile).
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/access?message=signed_out');
}
