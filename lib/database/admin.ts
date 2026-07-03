import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getSupabaseUrl, requireEnv } from '@/lib/utils/env';
import type { Database } from '@/lib/database.types';

export function createSupabaseAdminClient() {
  return createClient<Database>(
    getSupabaseUrl(),
    requireEnv('SUPABASE_SECRET_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
