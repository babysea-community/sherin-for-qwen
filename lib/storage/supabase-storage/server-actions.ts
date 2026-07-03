import 'server-only';

import { createSupabaseAdminClient } from '@/lib/database/admin';
import type { StorageProvider, StoreInput, StoreResult } from '../types';

export const SHERIN_BUCKET = 'sherin-generations';
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export function createSupabaseStorageProvider(): StorageProvider {
  return {
    id: 'supabase-storage',
    label: `supabase-storage · ${SHERIN_BUCKET}`,
    async store(input: StoreInput): Promise<StoreResult> {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.storage
        .from(SHERIN_BUCKET)
        .upload(input.key, input.data, {
          contentType: input.contentType,
          upsert: true,
        });

      if (error) {
        throw error;
      }

      return { storagePath: input.key, publicUrl: null };
    },
    async remove(storagePaths: string[]) {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.storage
        .from(SHERIN_BUCKET)
        .remove(storagePaths);

      if (error) {
        throw error;
      }
    },
    async signedUrl(storagePath: string) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.storage
        .from(SHERIN_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

      if (error) {
        return null;
      }

      return data.signedUrl;
    },
  };
}
