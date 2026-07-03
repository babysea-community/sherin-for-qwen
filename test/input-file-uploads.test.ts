import { describe, expect, it } from 'vitest';

import {
  cleanupInputFileUploads,
  createInputFileAssetUrls,
  type StoredInputFileAsset,
} from '@/app/dashboard/studio/_lib/input-file-uploads';

describe('input file upload assets', () => {
  it('resolves stored public input URLs from durable asset metadata', async () => {
    const asset: StoredInputFileAsset = {
      byteLength: 1234,
      contentType: 'image/png',
      publicUrl: 'https://storage.example.com/input.png',
      source: 'upload',
      storagePath:
        'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.png',
      storageProvider: 'vercel-blob',
      url: 'https://storage.example.com/input.png',
    };

    await expect(createInputFileAssetUrls([asset])).resolves.toEqual([
      'https://storage.example.com/input.png',
    ]);
  });

  it('prefers stored HTTPS URLs for URL-source durable asset metadata', async () => {
    const asset: StoredInputFileAsset = {
      byteLength: 70343,
      contentType: 'image/jpeg',
      originalUrl: 'https://remote.example.com/input.jpg',
      publicUrl: 'https://storage.example.com/copied-input.jpg',
      source: 'url',
      storagePath:
        'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.jpg',
      storageProvider: 'supabase-storage',
      url: 'https://storage.example.com/copied-input.jpg',
    };

    await expect(createInputFileAssetUrls([asset])).resolves.toEqual([
      'https://storage.example.com/copied-input.jpg',
    ]);
  });

  it('falls back to original HTTPS URLs for URL-source durable asset metadata', async () => {
    const asset: StoredInputFileAsset = {
      byteLength: 70343,
      contentType: 'image/jpeg',
      originalUrl: 'https://remote.example.com/input.jpg',
      publicUrl: 'http://127.0.0.1:54321/storage/v1/object/public/input.jpg',
      source: 'url',
      storagePath:
        'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.jpg',
      storageProvider: 'supabase-storage',
      url: 'https://remote.example.com/input.jpg',
    };

    await expect(createInputFileAssetUrls([asset])).resolves.toEqual([
      'https://remote.example.com/input.jpg',
    ]);
  });

  it('uses the same URL-source fallback for video asset metadata', async () => {
    const asset: StoredInputFileAsset = {
      byteLength: 1_234_567,
      contentType: 'video/mp4',
      originalUrl: 'https://remote.example.com/input.mp4',
      publicUrl: 'http://127.0.0.1:54321/storage/v1/object/public/input.mp4',
      source: 'url',
      storagePath:
        'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.mp4',
      storageProvider: 'supabase-storage',
      url: 'https://remote.example.com/input.mp4',
    };

    await expect(createInputFileAssetUrls([asset])).resolves.toEqual([
      'https://remote.example.com/input.mp4',
    ]);
  });

  it('reports legacy Supabase input cleanup failures', async () => {
    const admin = {
      storage: {
        from: () => ({
          remove: async () => ({ error: new Error('cleanup failed') }),
        }),
      },
    } as unknown as Parameters<typeof cleanupInputFileUploads>[0];

    await expect(
      cleanupInputFileUploads(admin, 'user-1', [
        'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.png',
      ]),
    ).resolves.toBe(false);
  });
});
