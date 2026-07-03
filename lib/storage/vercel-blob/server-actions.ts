import 'server-only';

import { getOptionalEnv, requireEnv } from '@/lib/utils/env';
import type { StorageProvider, StoreInput, StoreResult } from '../types';

export function isVercelBlobConfigured() {
  return Boolean(getOptionalEnv('BLOB_READ_WRITE_TOKEN'));
}

export function createVercelBlobProvider(): StorageProvider {
  const token = requireEnv('BLOB_READ_WRITE_TOKEN');

  return {
    id: 'vercel-blob',
    label: 'vercel-blob',
    async store(input: StoreInput): Promise<StoreResult> {
      // Dynamically import so projects that don't use vercel-blob aren't
      // forced to install @vercel/blob.
      const blob = await loadVercelBlob();
      const result = await blob.put(input.key, input.data, {
        access: 'public',
        contentType: input.contentType,
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return { storagePath: input.key, publicUrl: result.url };
    },
    async signedUrl() {
      // vercel-blob assets are public when uploaded with `access: 'public'`,
      // so we always rely on `publicUrl` returned at store time.
      return null;
    },
    async remove(storagePaths: string[]) {
      if (storagePaths.length === 0) {
        return;
      }

      const blob = await loadVercelBlob();
      const urls: string[] = [];

      for (const storagePath of storagePaths) {
        const result = await blob.list({
          limit: 1000,
          prefix: storagePath,
          token,
        });
        const match = result.blobs.find(
          (item) => item.pathname === storagePath,
        );

        if (match) {
          urls.push(match.url);
        }
      }

      if (urls.length > 0) {
        await blob.del(urls, { token });
      }
    },
  };
}

type VercelBlobModule = {
  del: (url: string[] | string, options?: { token: string }) => Promise<void>;
  list: (options?: {
    limit?: number;
    prefix?: string;
    token: string;
  }) => Promise<{ blobs: Array<{ pathname: string; url: string }> }>;
  put: (
    pathname: string,
    body: Uint8Array | Buffer | Blob,
    options: {
      access: 'public';
      contentType: string;
      token: string;
      addRandomSuffix?: boolean;
      allowOverwrite?: boolean;
    },
  ) => Promise<{ url: string }>;
};

async function loadVercelBlob(): Promise<VercelBlobModule> {
  try {
    return (await import('@vercel/blob')) as unknown as VercelBlobModule;
  } catch {
    throw new Error(
      'vercel-blob is selected but `@vercel/blob` is not installed. Run `pnpm add @vercel/blob`.',
    );
  }
}
