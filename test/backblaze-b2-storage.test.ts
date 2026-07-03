import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('Backblaze B2 native storage provider', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BACKBLAZE_B2_APPLICATION_KEY: 'application-key',
      BACKBLAZE_B2_BUCKET_NAME: 'the-blazer',
      BACKBLAZE_B2_KEY_ID: 'key-id',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('retries upload with a fresh upload URL when Backblaze rejects the first upload token', async () => {
    const mediaBytes = new TextEncoder().encode('generated image bytes');
    const uploadBodies: Uint8Array[] = [];
    const uploadHeaders: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/b2_authorize_account')) {
        return jsonResponse({
          accountId: 'account-id',
          apiInfo: {
            storageApi: {
              apiUrl: 'https://api005.backblazeb2.com',
              bucketId: 'bucket-id',
              bucketName: 'the-blazer',
              downloadUrl: 'https://f005.backblazeb2.com',
            },
          },
          applicationKeyExpirationTimestamp: null,
          authorizationToken: 'account-token',
        });
      }

      if (requestUrl.endsWith('/b2_get_upload_url')) {
        const requestNumber = fetchMock.mock.calls.filter(([callUrl]) =>
          String(callUrl).endsWith('/b2_get_upload_url'),
        ).length;

        return jsonResponse({
          authorizationToken: `upload-token-${requestNumber}`,
          uploadUrl: `https://pod.example.com/upload-${requestNumber}`,
        });
      }

      if (requestUrl === 'https://pod.example.com/upload-1') {
        uploadBodies.push(toBytes(init?.body));
        uploadHeaders.push(toHeaderRecord(init?.headers));

        return jsonResponse(
          { code: 'expired_auth_token', message: 'Upload token expired.' },
          { status: 401 },
        );
      }

      if (requestUrl === 'https://pod.example.com/upload-2') {
        uploadBodies.push(toBytes(init?.body));
        uploadHeaders.push(toHeaderRecord(init?.headers));

        return jsonResponse({
          fileName: 'user 1/generation+日本語.png',
        });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { createBackblazeB2StorageProvider } =
      await import('@/lib/storage/backblaze-b2/server-actions');
    const provider = createBackblazeB2StorageProvider();

    await expect(
      provider.store({
        contentType: 'image/png',
        data: mediaBytes,
        key: 'user 1/generation+日本語.png',
      }),
    ).resolves.toEqual({
      publicUrl: null,
      storagePath: 'user 1/generation+日本語.png',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api005.backblazeb2.com/b2api/v3/b2_get_upload_url',
      expect.objectContaining({
        body: JSON.stringify({ bucketId: 'bucket-id' }),
        method: 'POST',
      }),
    );
    expect(uploadBodies.map((body) => Array.from(body))).toEqual([
      Array.from(mediaBytes),
      Array.from(mediaBytes),
    ]);
    expect(uploadHeaders[1]).toMatchObject({
      Authorization: 'upload-token-2',
      'Content-Length': String(mediaBytes.byteLength),
      'Content-Type': 'image/png',
      'X-Bz-Content-Sha1': createHash('sha1').update(mediaBytes).digest('hex'),
      'X-Bz-File-Name': 'user%201/generation%2B%E6%97%A5%E6%9C%AC%E8%AA%9E.png',
    });
  });

  it('accepts standard B2_KEY_ID and B2_APP_KEY environment aliases', async () => {
    process.env = {
      ...originalEnv,
      B2_APP_KEY: 'alias-application-key',
      B2_BUCKET_NAME: 'the-blazer',
      B2_KEY_ID: 'alias-key-id',
    };

    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/b2_authorize_account')) {
        return jsonResponse({
          accountId: 'account-id',
          apiInfo: {
            storageApi: {
              apiUrl: 'https://api005.backblazeb2.com',
              bucketId: 'bucket-id',
              bucketName: 'the-blazer',
              downloadUrl: 'https://f005.backblazeb2.com',
            },
          },
          applicationKeyExpirationTimestamp: null,
          authorizationToken: 'account-token',
        });
      }

      if (requestUrl.endsWith('/b2_get_upload_url')) {
        return jsonResponse({
          authorizationToken: 'upload-token',
          uploadUrl: 'https://pod.example.com/upload',
        });
      }

      if (requestUrl === 'https://pod.example.com/upload') {
        return jsonResponse({ fileName: 'asset.png' });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { createBackblazeB2StorageProvider, isBackblazeB2StorageConfigured } =
      await import('@/lib/storage/backblaze-b2/server-actions');

    expect(isBackblazeB2StorageConfigured()).toBe(true);

    await createBackblazeB2StorageProvider().store({
      contentType: 'image/png',
      data: new TextEncoder().encode('image'),
      key: 'asset.png',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
      expect.objectContaining({
        headers: {
          Authorization: `Basic ${Buffer.from('alias-key-id:alias-application-key').toString('base64')}`,
        },
      }),
    );
  });

  it('refreshes account authorization when Backblaze rejects a cached API token', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/b2_authorize_account')) {
        const requestNumber = fetchMock.mock.calls.filter(([callUrl]) =>
          String(callUrl).endsWith('/b2_authorize_account'),
        ).length;

        return jsonResponse({
          accountId: 'account-id',
          apiInfo: {
            storageApi: {
              apiUrl: 'https://api005.backblazeb2.com',
              bucketId: 'bucket-id',
              bucketName: 'the-blazer',
              downloadUrl: 'https://f005.backblazeb2.com',
            },
          },
          applicationKeyExpirationTimestamp: null,
          authorizationToken: `account-token-${requestNumber}`,
        });
      }

      if (requestUrl.endsWith('/b2_get_upload_url')) {
        const requestNumber = fetchMock.mock.calls.filter(([callUrl]) =>
          String(callUrl).endsWith('/b2_get_upload_url'),
        ).length;

        if (requestNumber === 1) {
          return jsonResponse(
            { code: 'expired_auth_token', message: 'Account token expired.' },
            { status: 401 },
          );
        }

        return jsonResponse({
          authorizationToken: 'upload-token',
          uploadUrl: 'https://pod.example.com/upload',
        });
      }

      if (requestUrl === 'https://pod.example.com/upload') {
        return jsonResponse({ fileName: 'asset.png' });
      }

      throw new Error(`Unexpected fetch URL: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { createBackblazeB2StorageProvider } =
      await import('@/lib/storage/backblaze-b2/server-actions');

    await createBackblazeB2StorageProvider().store({
      contentType: 'image/png',
      data: new TextEncoder().encode('image'),
      key: 'asset.png',
    });

    expect(
      fetchMock.mock.calls.filter(([callUrl]) =>
        String(callUrl).endsWith('/b2_authorize_account'),
      ),
    ).toHaveLength(2);
  });
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init?.status ?? 200,
  });
}

function toBytes(body: BodyInit | null | undefined) {
  if (body instanceof Uint8Array) {
    return body;
  }

  throw new Error('Expected Uint8Array request body.');
}

function toHeaderRecord(headers: HeadersInit | undefined) {
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    throw new Error('Expected plain object request headers.');
  }

  return headers as Record<string, string>;
}
