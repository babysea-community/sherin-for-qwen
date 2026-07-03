import 'server-only';

import { createHash } from 'node:crypto';

import { getOptionalEnv } from '@/lib/utils/env';
import type { StorageProvider, StoreInput, StoreResult } from '../types';

const B2_API_BASE_URL = 'https://api.backblazeb2.com';
const B2_API_VERSION = 'v3';
const AUTH_CACHE_TTL_MS = 23 * 60 * 60 * 1000;
const DOWNLOAD_AUTH_TTL_SECONDS = 60 * 60;
const UPLOAD_URL_ATTEMPTS = 5;
const B2_API_TIMEOUT_MS = 30_000;
const B2_UPLOAD_TIMEOUT_MS = 5 * 60_000;
const KEY_ID_ENV_NAMES = ['BACKBLAZE_B2_KEY_ID', 'B2_KEY_ID'] as const;
const APPLICATION_KEY_ENV_NAMES = [
  'BACKBLAZE_B2_APPLICATION_KEY',
  'BACKBLAZE_B2_APP_KEY',
  'B2_APP_KEY',
] as const;
const BUCKET_NAME_ENV_NAMES = [
  'BACKBLAZE_B2_BUCKET_NAME',
  'B2_BUCKET_NAME',
] as const;

type BackblazeB2Error = Error & {
  code?: string;
  status?: number;
};

type BackblazeAuthorization = {
  accountId: string;
  allowed?: {
    bucketId?: string | null;
    bucketName?: string | null;
  };
  apiUrl: string;
  authorizationToken: string;
  downloadUrl: string;
};

type BackblazeAuthorizeResponse = {
  accountId: string;
  allowed?: {
    bucketId?: string | null;
    bucketName?: string | null;
  };
  apiInfo?: {
    storageApi?: {
      apiUrl?: string;
      bucketId?: string | null;
      bucketName?: string | null;
      downloadUrl?: string;
    };
  };
  apiUrl?: string;
  authorizationToken: string;
  downloadUrl?: string;
};

type BackblazeBucket = {
  bucketId: string;
  bucketName: string;
};

type BackblazeUploadUrl = {
  authorizationToken: string;
  uploadUrl: string;
};

type BackblazeUploadResponse = {
  fileName: string;
};

type BackblazeDownloadAuthorization = {
  authorizationToken: string;
};

type BackblazeListBucketsResponse = {
  buckets?: BackblazeBucket[];
};

type BackblazeListFileVersionsResponse = {
  files?: Array<{
    fileId: string;
    fileName: string;
  }>;
  nextFileId?: string | null;
  nextFileName?: string | null;
};

let cachedAuthorization: {
  cacheKey: string;
  expiresAt: number;
  value: BackblazeAuthorization;
} | null = null;

let cachedBuckets = new Map<string, BackblazeBucket>();

export function isBackblazeB2StorageConfigured() {
  return Boolean(
    optionalFirstEnv(KEY_ID_ENV_NAMES) &&
    optionalFirstEnv(APPLICATION_KEY_ENV_NAMES) &&
    optionalFirstEnv(BUCKET_NAME_ENV_NAMES),
  );
}

export function createBackblazeB2StorageProvider(): StorageProvider {
  const bucketName = requireFirstEnv(BUCKET_NAME_ENV_NAMES);

  return {
    id: 'backblaze-b2',
    label: `backblaze-b2 · ${bucketName}`,
    async store(payload: StoreInput): Promise<StoreResult> {
      const bucket = await resolveBucket(bucketName);
      const fileName = normalizeFileName(payload.key);
      const uploaded = await uploadFileWithFreshUrls(bucket.bucketId, {
        ...payload,
        key: fileName,
      });

      return {
        storagePath: uploaded.fileName || fileName,
        publicUrl: null,
      };
    },
    async remove(storagePaths: string[]) {
      if (storagePaths.length === 0) {
        return;
      }

      const bucket = await resolveBucket(bucketName);

      for (const storagePath of storagePaths) {
        await deleteFileVersions(
          bucket.bucketId,
          normalizeFileName(storagePath),
        );
      }
    },
    async signedUrl(storagePath: string) {
      return createAuthorizedDownloadUrl(
        bucketName,
        normalizeFileName(storagePath),
      );
    },
  };
}

async function authorizeAccount({ forceRefresh = false } = {}) {
  const keyId = requireFirstEnv(KEY_ID_ENV_NAMES);
  const applicationKey = requireFirstEnv(APPLICATION_KEY_ENV_NAMES);
  const cacheKey = `${keyId}:${applicationKey}`;

  if (
    !forceRefresh &&
    cachedAuthorization?.cacheKey === cacheKey &&
    cachedAuthorization.expiresAt > Date.now()
  ) {
    return cachedAuthorization.value;
  }

  const response = await fetch(
    `${B2_API_BASE_URL}/b2api/${B2_API_VERSION}/b2_authorize_account`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(B2_API_TIMEOUT_MS),
    },
  );
  const authorization = normalizeAuthorization(
    await readB2Json<BackblazeAuthorizeResponse>(
      response,
      'b2_authorize_account',
    ),
  );

  cachedAuthorization = {
    cacheKey,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    value: authorization,
  };
  cachedBuckets = new Map();

  return authorization;
}

function normalizeAuthorization(
  response: BackblazeAuthorizeResponse,
): BackblazeAuthorization {
  const storageApi = response.apiInfo?.storageApi;
  const apiUrl = storageApi?.apiUrl ?? response.apiUrl;
  const downloadUrl = storageApi?.downloadUrl ?? response.downloadUrl;

  if (!apiUrl || !downloadUrl) {
    throw new Error(
      'Backblaze B2 authorization response did not include storage API endpoints.',
    );
  }

  return {
    accountId: response.accountId,
    allowed: {
      bucketId: storageApi?.bucketId ?? response.allowed?.bucketId ?? null,
      bucketName:
        storageApi?.bucketName ?? response.allowed?.bucketName ?? null,
    },
    apiUrl,
    authorizationToken: response.authorizationToken,
    downloadUrl,
  };
}

async function resolveBucket(bucketName: string) {
  const explicitBucketId = getOptionalEnv('BACKBLAZE_B2_BUCKET_ID');
  const cacheKey = `${bucketName}:${explicitBucketId ?? ''}`;
  const cachedBucket = cachedBuckets.get(cacheKey);

  if (cachedBucket) {
    return cachedBucket;
  }

  const authorization = await authorizeAccount();

  if (explicitBucketId) {
    return cacheBucket(cacheKey, {
      bucketId: explicitBucketId,
      bucketName,
    });
  }

  if (
    authorization.allowed?.bucketName === bucketName &&
    authorization.allowed.bucketId
  ) {
    return cacheBucket(cacheKey, {
      bucketId: authorization.allowed.bucketId,
      bucketName,
    });
  }

  const response = await b2Api<BackblazeListBucketsResponse>(
    authorization,
    'b2_list_buckets',
    {
      accountId: authorization.accountId,
      bucketName,
    },
  );
  const bucket = response.buckets?.find(
    (candidate) => candidate.bucketName === bucketName,
  );

  if (!bucket) {
    throw new Error(`Backblaze B2 bucket not found: ${bucketName}`);
  }

  return cacheBucket(cacheKey, bucket);
}

function cacheBucket(cacheKey: string, bucket: BackblazeBucket) {
  cachedBuckets.set(cacheKey, bucket);

  return bucket;
}

async function getUploadUrl(bucketId: string) {
  const authorization = await authorizeAccount();

  return b2Api<BackblazeUploadUrl>(authorization, 'b2_get_upload_url', {
    bucketId,
  });
}

async function uploadFileWithFreshUrls(bucketId: string, payload: StoreInput) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= UPLOAD_URL_ATTEMPTS; attempt += 1) {
    const upload = await getUploadUrl(bucketId);

    try {
      return await uploadFile(upload, payload);
    } catch (error) {
      lastError = error;

      if (!isRetryableUploadError(error) || attempt === UPLOAD_URL_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Backblaze B2 upload failed.');
}

async function uploadFile(upload: BackblazeUploadUrl, payload: StoreInput) {
  const body = Buffer.from(payload.data);
  const response = await fetch(upload.uploadUrl, {
    body,
    headers: {
      Authorization: upload.authorizationToken,
      'Content-Length': String(body.byteLength),
      'Content-Type': payload.contentType,
      'X-Bz-Content-Sha1': sha1Hex(body),
      'X-Bz-File-Name': encodeB2Path(payload.key),
    },
    method: 'POST',
    signal: AbortSignal.timeout(B2_UPLOAD_TIMEOUT_MS),
  });

  return readB2Json<BackblazeUploadResponse>(response, 'b2_upload_file');
}

async function createAuthorizedDownloadUrl(
  bucketName: string,
  fileName: string,
) {
  const authorization = await authorizeAccount();
  const bucket = await resolveBucket(bucketName);
  const downloadAuthorization = await b2Api<BackblazeDownloadAuthorization>(
    authorization,
    'b2_get_download_authorization',
    {
      bucketId: bucket.bucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds: DOWNLOAD_AUTH_TTL_SECONDS,
    },
  );

  return `${authorization.downloadUrl}/file/${encodeURIComponent(bucketName)}/${encodeB2Path(fileName)}?Authorization=${encodeURIComponent(downloadAuthorization.authorizationToken)}`;
}

async function deleteFileVersions(bucketId: string, fileName: string) {
  const authorization = await authorizeAccount();
  let nextFileName: string | null | undefined = fileName;
  let nextFileId: string | null | undefined;

  while (nextFileName) {
    const response: BackblazeListFileVersionsResponse = await b2Api(
      authorization,
      'b2_list_file_versions',
      {
        bucketId,
        maxFileCount: 100,
        prefix: fileName,
        startFileId: nextFileId ?? undefined,
        startFileName: nextFileName,
      },
    );
    const files = response.files ?? [];

    for (const file of files) {
      if (file.fileName !== fileName) {
        continue;
      }

      await b2Api(authorization, 'b2_delete_file_version', {
        fileId: file.fileId,
        fileName: file.fileName,
      });
    }

    if (!response.nextFileName || !response.nextFileName.startsWith(fileName)) {
      break;
    }

    nextFileName = response.nextFileName;
    nextFileId = response.nextFileId;
  }
}

async function b2Api<T>(
  authorization: BackblazeAuthorization,
  operation: string,
  body: Record<string, unknown>,
) {
  try {
    return await callB2Api<T>(authorization, operation, body);
  } catch (error) {
    if (!isExpiredAuthorizationError(error)) {
      throw error;
    }

    cachedAuthorization = null;

    return callB2Api<T>(
      await authorizeAccount({ forceRefresh: true }),
      operation,
      body,
    );
  }
}

async function callB2Api<T>(
  authorization: BackblazeAuthorization,
  operation: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    `${authorization.apiUrl}/b2api/${B2_API_VERSION}/${operation}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: authorization.authorizationToken,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(B2_API_TIMEOUT_MS),
    },
  );

  return readB2Json<T>(response, operation);
}

function optionalFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = getOptionalEnv(name);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function requireFirstEnv(names: readonly string[]) {
  const value = optionalFirstEnv(names);

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${names.join(' or ')}`,
    );
  }

  return value;
}

async function readB2Json<T>(response: Response, operation: string) {
  const text = await response.text();

  if (!response.ok) {
    throw createB2Error(response, operation, text);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

function createB2Error(
  response: Response,
  operation: string,
  text: string,
): BackblazeB2Error {
  const body = parseB2ErrorBody(text);
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message = typeof body?.message === 'string' ? body.message : text;
  const error = new Error(
    `Backblaze B2 ${operation} failed (${response.status}${code ? ` ${code}` : ''}): ${message || response.statusText}`,
  ) as BackblazeB2Error;

  error.code = code;
  error.status = response.status;

  return error;
}

function parseB2ErrorBody(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as { code?: unknown; message?: unknown };
  } catch {
    return null;
  }
}

function isRetryableUploadError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = 'status' in error ? error.status : undefined;
  const code = 'code' in error ? error.code : undefined;

  if (typeof status !== 'number') {
    return error instanceof TypeError;
  }

  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    (status === 401 &&
      (code === 'expired_auth_token' || code === 'bad_auth_token'))
  );
}

function isExpiredAuthorizationError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = 'status' in error ? error.status : undefined;
  const code = 'code' in error ? error.code : undefined;

  return (
    status === 401 &&
    (code === 'expired_auth_token' || code === 'bad_auth_token')
  );
}

function normalizeFileName(value: string) {
  const fileName = value.replace(/^\/+/, '');

  if (!fileName || fileName.includes('\0')) {
    throw new Error('Backblaze B2 storage path is invalid.');
  }

  return fileName;
}

function encodeB2Path(fileName: string) {
  return fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sha1Hex(data: Uint8Array) {
  return createHash('sha1').update(data).digest('hex');
}
