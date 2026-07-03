import 'server-only';

import {
  resolveStorageProviderById,
  type StorageProviderId,
} from '@/lib/storage';
import { getGenerationMetadataString } from '@/lib/generation/display';
import type { Json } from '@/lib/database.types';

export type StoredGenerationLike = {
  metadata: Json | null;
  storage_provider: string;
};

/**
 * Resolve a viewable asset URL for a stored generation. Public URLs from
 * Public URLs from aws-s3, cloudflare-r2, or vercel-blob custom domains are
 * returned directly; otherwise a short-lived signed URL is generated through
 * the stored provider.
 */
export async function resolveAssetUrl(
  generation: StoredGenerationLike,
): Promise<string | null> {
  const publicUrl = getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_public_url',
  );

  if (publicUrl) {
    return publicUrl;
  }

  const storagePath = getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_path',
  );

  if (!storagePath) {
    return null;
  }

  const storageProvider =
    getGenerationMetadataString(
      generation.metadata,
      'sherin_storage_provider',
    ) ?? generation.storage_provider;

  try {
    if (!isStorageProviderId(storageProvider)) {
      return null;
    }

    const provider = resolveStorageProviderById(storageProvider);

    return await provider.signedUrl(storagePath);
  } catch {
    return null;
  }
}

function isStorageProviderId(value: string): value is StorageProviderId {
  return (
    value === 'aws-s3' ||
    value === 'backblaze-b2' ||
    value === 'cloudflare-r2' ||
    value === 'supabase-storage' ||
    value === 'vercel-blob'
  );
}
