import 'server-only';

import { createSupabaseAdminClient } from '@/lib/database/admin';
import { getOptionalEnv, getOptionalPositiveIntEnv } from '@/lib/utils/env';
import type {
  StorageProvider,
  StorageProviderId,
  StoreInput,
  StoreResult,
} from './types';
import {
  createAwsS3StorageProvider,
  isAwsS3StorageConfigured,
} from './aws-s3/server-actions';
import {
  createBackblazeB2StorageProvider,
  isBackblazeB2StorageConfigured,
} from './backblaze-b2/server-actions';
import {
  createCloudflareR2StorageProvider,
  isCloudflareR2StorageConfigured,
} from './cloudflare-r2/server-actions';
import { createSupabaseStorageProvider } from './supabase-storage/server-actions';
import {
  createVercelBlobProvider,
  isVercelBlobConfigured,
} from './vercel-blob/server-actions';

export type {
  StorageProvider,
  StorageProviderId,
  StoreInput,
  StoreResult,
} from './types';

export type PersistedStorageAsset = StoreResult & {
  byteLength: number;
  contentType: string;
  providerId: StorageProviderId;
  fallbackFromProviderId?: StorageProviderId;
  fallbackReason?: string;
};

type PersistedRemoteAsset = PersistedStorageAsset;

type StorageWriteContext = {
  generationId: string;
  remoteHost: string;
  storageKey: string;
  byteLength: number;
  contentType: string;
  outputFormat: string;
  fallbackFromProviderId?: StorageProviderId | null;
};

export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_ASSET_BYTES = 500 * 1024 * 1024;
export const DEFAULT_USER_STORAGE_QUOTA_GB = 10;
const BYTES_PER_GB = 1_000_000_000;
const ASSET_FETCH_TIMEOUT_MS = 30_000;
const ASSET_DOWNLOAD_RETRY_DELAYS_MS = [0, 750, 2_000] as const;
const STORAGE_WRITE_RETRY_DELAYS_MS = [0, 750, 2_000] as const;
const ALLOWED_ASSET_HOST_SUFFIXES = [
  // Inference
  'aliyuncs.com',
  // BabySea
  'app.babysea.ai',
  'app.us.babysea.ai',
  'app.eu.babysea.ai',
  'app.jp.babysea.ai',
];
const ALLOWED_ASSET_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
]);

/**
 * Resolve the active storage provider. Honors STORAGE_PROVIDER first, then
 * falls back to supabase-storage.
 */
export function resolveStorageProvider(): StorageProvider {
  const configuredPreference = getOptionalEnv('STORAGE_PROVIDER');
  const preferred = normalizePreference(configuredPreference);

  if (configuredPreference && !preferred) {
    throw new Error(
      'STORAGE_PROVIDER must be aws-s3, backblaze-b2, cloudflare-r2, supabase-storage, or vercel-blob.',
    );
  }

  if (preferred) {
    return createProvider(preferred);
  }

  return createSupabaseStorageProvider();
}

export function resolveStorageProviderById(
  id: StorageProviderId,
): StorageProvider {
  return createProvider(id);
}

export function getStorageProviderStatus() {
  const preferred = normalizePreference(getOptionalEnv('STORAGE_PROVIDER'));
  const active = (() => {
    try {
      return resolveStorageProvider().id;
    } catch {
      return null;
    }
  })();

  return {
    preferred,
    active,
    availability: {
      'aws-s3': isAwsS3StorageConfigured(),
      'backblaze-b2': isBackblazeB2StorageConfigured(),
      'cloudflare-r2': isCloudflareR2StorageConfigured(),
      'supabase-storage': true,
      'vercel-blob': isVercelBlobConfigured(),
    },
  };
}

/**
 * Download a remote asset and persist it through the active storage provider.
 * If that write fails, app falls back to its own Supabase bucket before
 * leaving the provider-hosted URL as the only usable image.
 */
export async function persistRemoteAsset(input: {
  remoteUrl: string;
  userId: string;
  generationId: string;
  outputFormat: string;
}): Promise<PersistedRemoteAsset> {
  const url = parseAllowedAssetUrl(input.remoteUrl);
  const response = await fetchGeneratedAsset(url);

  const contentType = normalizeContentType(
    response.headers.get('content-type'),
    input.outputFormat,
  );

  if (!ALLOWED_ASSET_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unsupported asset content type: ${contentType}`);
  }

  const contentLength = parseContentLength(
    response.headers.get('content-length'),
  );

  if (contentLength !== null) {
    assertAssetByteLimit(contentLength, contentType);
    await assertUserStorageQuota(input.userId, contentLength);
  }

  const data = await readLimitedBody(response, contentType);

  if (contentLength === null || data.byteLength > contentLength) {
    await assertUserStorageQuota(input.userId, data.byteLength);
  }

  const extension = extensionForContentType(contentType);
  const key = `${input.userId}/${input.generationId}.${extension}`;
  const payload = {
    key,
    data,
    contentType,
  } satisfies StoreInput;
  const writeContext: StorageWriteContext = {
    generationId: input.generationId,
    remoteHost: url.hostname,
    storageKey: key,
    byteLength: data.byteLength,
    contentType,
    outputFormat: input.outputFormat,
  };

  logStorageInfo('asset_downloaded', writeContext);

  const preferredProvider = resolveStorageProviderForWrite();

  if (!preferredProvider.provider) {
    logStorageWarn('preferred_provider_unavailable_trying_supabase_fallback', {
      ...writeContext,
      preferredProviderId: preferredProvider.providerId,
      fallbackProviderId: 'supabase-storage',
      error: storageErrorDetails(preferredProvider.error),
    });

    return storeWithSupabaseFallback({
      payload,
      context: writeContext,
      fallbackFromProviderId: preferredProvider.providerId,
      fallbackReason: preferredProvider.error,
    });
  }

  try {
    const stored = await storeGeneratedAssetWithRetry(
      preferredProvider.provider,
      payload,
      writeContext,
    );

    return {
      ...stored,
      byteLength: data.byteLength,
      contentType,
      providerId: preferredProvider.provider.id,
    };
  } catch (error) {
    if (preferredProvider.provider.id === 'supabase-storage') {
      throw error;
    }

    logStorageWarn('preferred_provider_failed_trying_supabase_fallback', {
      ...writeContext,
      providerId: preferredProvider.provider.id,
      providerLabel: preferredProvider.provider.label,
      fallbackProviderId: 'supabase-storage',
      error: storageErrorDetails(error),
    });

    return storeWithSupabaseFallback({
      payload,
      context: writeContext,
      fallbackFromProviderId: preferredProvider.provider.id,
      fallbackReason: error,
    });
  }
}

export async function persistInputReferenceAsset(input: {
  byteLength: number;
  contentType: string;
  data: Uint8Array;
  extension: string;
  generationId: string;
  index: number;
  remoteHost: string;
  reservedBytes?: number;
  userId: string;
}): Promise<PersistedStorageAsset> {
  await assertUserStorageQuota(
    input.userId,
    input.byteLength,
    input.reservedBytes ?? 0,
  );

  const key = `user-upload/${input.userId}/${input.generationId}/input-${input.index + 1}.${input.extension}`;
  const payload = {
    key,
    data: input.data,
    contentType: input.contentType,
  } satisfies StoreInput;
  const writeContext: StorageWriteContext = {
    generationId: input.generationId,
    remoteHost: input.remoteHost,
    storageKey: key,
    byteLength: input.byteLength,
    contentType: input.contentType,
    outputFormat: 'input-reference',
  };

  logStorageInfo('input_reference_prepared', writeContext);

  const preferredProvider = resolveStorageProviderForWrite();

  if (!preferredProvider.provider) {
    logStorageWarn('preferred_provider_unavailable_trying_supabase_fallback', {
      ...writeContext,
      preferredProviderId: preferredProvider.providerId,
      fallbackProviderId: 'supabase-storage',
      error: storageErrorDetails(preferredProvider.error),
    });

    return storeWithSupabaseFallback({
      payload,
      context: writeContext,
      fallbackFromProviderId: preferredProvider.providerId,
      fallbackReason: preferredProvider.error,
    });
  }

  try {
    const stored = await storeGeneratedAssetWithRetry(
      preferredProvider.provider,
      payload,
      writeContext,
    );

    return {
      ...stored,
      byteLength: input.byteLength,
      contentType: input.contentType,
      providerId: preferredProvider.provider.id,
    };
  } catch (error) {
    if (preferredProvider.provider.id === 'supabase-storage') {
      throw error;
    }

    logStorageWarn('preferred_provider_failed_trying_supabase_fallback', {
      ...writeContext,
      providerId: preferredProvider.provider.id,
      providerLabel: preferredProvider.provider.label,
      fallbackProviderId: 'supabase-storage',
      error: storageErrorDetails(error),
    });

    return storeWithSupabaseFallback({
      payload,
      context: writeContext,
      fallbackFromProviderId: preferredProvider.provider.id,
      fallbackReason: error,
    });
  }
}

export async function resolveStoredAssetUrl(input: {
  publicUrl?: string | null;
  storagePath: string;
  storageProvider: StorageProviderId;
}) {
  if (input.publicUrl) {
    return input.publicUrl;
  }

  const provider = resolveStorageProviderById(input.storageProvider);

  return provider.signedUrl(input.storagePath);
}

export async function removeStoredAssets(
  assets: Array<{ storagePath: string; storageProvider: StorageProviderId }>,
) {
  const assetsByProvider = new Map<StorageProviderId, string[]>();

  for (const asset of assets) {
    const paths = assetsByProvider.get(asset.storageProvider) ?? [];
    paths.push(asset.storagePath);
    assetsByProvider.set(asset.storageProvider, paths);
  }

  for (const [providerId, storagePaths] of assetsByProvider.entries()) {
    const provider = resolveStorageProviderById(providerId);

    if (!provider.remove) {
      continue;
    }

    await provider.remove(storagePaths);
  }
}

function resolveStorageProviderForWrite():
  | { provider: StorageProvider; providerId: StorageProviderId; error?: never }
  | {
      provider: null;
      providerId: StorageProviderId | null;
      error: unknown;
    } {
  try {
    const provider = resolveStorageProvider();

    return { provider, providerId: provider.id };
  } catch (error) {
    return {
      provider: null,
      providerId: normalizePreference(getOptionalEnv('STORAGE_PROVIDER')),
      error,
    };
  }
}

async function storeWithSupabaseFallback({
  payload,
  context,
  fallbackFromProviderId,
  fallbackReason,
}: {
  payload: StoreInput;
  context: StorageWriteContext;
  fallbackFromProviderId: StorageProviderId | null;
  fallbackReason: unknown;
}): Promise<PersistedRemoteAsset> {
  const provider = createSupabaseStorageProvider();

  try {
    const stored = await storeGeneratedAssetWithRetry(provider, payload, {
      ...context,
      fallbackFromProviderId,
    });

    logStorageInfo('supabase_fallback_saved', {
      ...context,
      providerId: provider.id,
      providerLabel: provider.label,
      storagePath: stored.storagePath,
      hasPublicUrl: Boolean(stored.publicUrl),
      fallbackFromProviderId,
      fallbackReason: storageErrorSummary(fallbackReason),
    });

    return {
      ...stored,
      byteLength: context.byteLength,
      contentType: context.contentType,
      providerId: provider.id,
      ...(fallbackFromProviderId
        ? {
            fallbackFromProviderId,
            fallbackReason: errorMessage(fallbackReason),
          }
        : { fallbackReason: errorMessage(fallbackReason) }),
    };
  } catch (fallbackError) {
    const primaryLabel = fallbackFromProviderId ?? 'preferred storage';

    logStorageError('supabase_fallback_failed', {
      ...context,
      providerId: provider.id,
      providerLabel: provider.label,
      fallbackFromProviderId,
      primaryError: storageErrorDetails(fallbackReason),
      fallbackError: storageErrorDetails(fallbackError),
    });

    throw new Error(
      `Could not store generated asset in ${primaryLabel}, then supabase-storage fallback failed: ${errorMessage(fallbackError)}`,
    );
  }
}

async function fetchGeneratedAsset(url: URL) {
  let lastError: unknown = null;

  for (const [
    attemptIndex,
    delayMs,
  ] of ASSET_DOWNLOAD_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(ASSET_FETCH_TIMEOUT_MS),
      });

      if (response.ok) {
        return response;
      }

      await response.body?.cancel().catch(() => {});

      const downloadError = new Error(
        `Could not download generated asset: ${response.status}`,
      );

      if (
        !isRetryableDownloadStatus(response.status) ||
        attemptIndex === ASSET_DOWNLOAD_RETRY_DELAYS_MS.length - 1
      ) {
        throw downloadError;
      }

      lastError = downloadError;
    } catch (error) {
      lastError = error;

      if (attemptIndex === ASSET_DOWNLOAD_RETRY_DELAYS_MS.length - 1) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not download generated asset.');
}

async function storeGeneratedAssetWithRetry(
  provider: StorageProvider,
  input: StoreInput,
  context: StorageWriteContext,
): Promise<StoreResult> {
  let lastError: unknown = null;

  for (const [
    attemptIndex,
    delayMs,
  ] of STORAGE_WRITE_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const attempt = attemptIndex + 1;
    const startedAt = Date.now();

    logStorageInfo('storage_write_attempt_started', {
      ...storageWriteLogContext(provider, input, context),
      attempt,
      maxAttempts: STORAGE_WRITE_RETRY_DELAYS_MS.length,
    });

    try {
      const stored = await provider.store(input);

      logStorageInfo('storage_write_attempt_succeeded', {
        ...storageWriteLogContext(provider, input, context),
        attempt,
        maxAttempts: STORAGE_WRITE_RETRY_DELAYS_MS.length,
        durationMs: Date.now() - startedAt,
        storagePath: stored.storagePath,
        hasPublicUrl: Boolean(stored.publicUrl),
      });

      return stored;
    } catch (error) {
      lastError = error;
      const details = {
        ...storageWriteLogContext(provider, input, context),
        attempt,
        maxAttempts: STORAGE_WRITE_RETRY_DELAYS_MS.length,
        durationMs: Date.now() - startedAt,
        error: storageErrorDetails(error),
      };

      if (attemptIndex === STORAGE_WRITE_RETRY_DELAYS_MS.length - 1) {
        logStorageError('storage_write_attempt_failed_final', details);
      } else {
        logStorageWarn('storage_write_attempt_failed_retrying', details);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not store generated asset.');
}

function createProvider(id: StorageProviderId): StorageProvider {
  switch (id) {
    case 'aws-s3':
      return createAwsS3StorageProvider();
    case 'backblaze-b2':
      return createBackblazeB2StorageProvider();
    case 'cloudflare-r2':
      return createCloudflareR2StorageProvider();
    case 'supabase-storage':
      return createSupabaseStorageProvider();
    case 'vercel-blob':
      return createVercelBlobProvider();
  }
}

function normalizePreference(
  value: string | undefined,
): StorageProviderId | null {
  if (!value) {
    return null;
  }

  const lower = value.trim().toLowerCase();

  if (
    lower === 'aws-s3' ||
    lower === 'backblaze-b2' ||
    lower === 'cloudflare-r2' ||
    lower === 'supabase-storage' ||
    lower === 'vercel-blob'
  ) {
    return lower;
  }

  return null;
}

function parseAllowedAssetUrl(remoteUrl: string) {
  const url = new URL(remoteUrl);

  if (url.protocol !== 'https:') {
    throw new Error('Generated asset URL must use HTTPS.');
  }

  const hostname = url.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_ASSET_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );

  if (!isAllowedHost) {
    throw new Error(`Unsupported asset host: ${hostname}`);
  }

  return url;
}

function normalizeContentType(value: string | null, outputFormat: string) {
  const fromHeader = value?.split(';')[0]?.trim().toLowerCase();

  if (fromHeader && ALLOWED_ASSET_CONTENT_TYPES.has(fromHeader)) {
    return fromHeader;
  }

  if (outputFormat === 'png') {
    return 'image/png';
  }

  if (outputFormat === 'webp') {
    return 'image/webp';
  }

  if (outputFormat === 'mp4') {
    return 'video/mp4';
  }

  return 'image/jpeg';
}

function isRetryableDownloadStatus(status: number) {
  return (
    status === 404 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 504)
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function storageErrorSummary(error: unknown) {
  const details = storageErrorDetails(error);
  const parts = [details.name, details.code, details.message].filter(Boolean);

  return parts.length > 0 ? parts.join(': ') : 'Unknown error';
}

function storageErrorDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { message: errorMessage(error) };
  }

  const record = error as Record<string, unknown>;
  const metadata = isRecord(record.$metadata) ? record.$metadata : null;
  const details: Record<string, unknown> = {
    message: errorMessage(error),
  };
  const name = error instanceof Error ? error.name : stringValue(record.name);
  const code = stringValue(record.Code) ?? stringValue(record.code);
  const fault = stringValue(record.$fault);
  const cause = record.cause;

  if (name) details.name = name;
  if (code) details.code = code;
  if (fault) details.fault = fault;
  if (cause) details.cause = errorMessage(cause);

  if (metadata) {
    addIfPresent(details, 'httpStatusCode', metadata.httpStatusCode);
    addIfPresent(details, 'requestId', metadata.requestId);
    addIfPresent(details, 'extendedRequestId', metadata.extendedRequestId);
    addIfPresent(details, 'cfId', metadata.cfId);
    addIfPresent(details, 'attempts', metadata.attempts);
    addIfPresent(details, 'totalRetryDelay', metadata.totalRetryDelay);
  }

  const hint = storageErrorHint(details);

  if (hint) {
    details.hint = hint;
  }

  return details;
}

function storageWriteLogContext(
  provider: StorageProvider,
  input: StoreInput,
  context: StorageWriteContext,
) {
  return {
    generationId: context.generationId,
    providerId: provider.id,
    providerLabel: provider.label,
    remoteHost: context.remoteHost,
    storageKey: context.storageKey,
    contentType: input.contentType,
    byteLength: input.data.byteLength,
    outputFormat: context.outputFormat,
    fallbackFromProviderId: context.fallbackFromProviderId ?? null,
  };
}

function storageErrorHint(details: Record<string, unknown>) {
  const text = [details.name, details.code, details.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const status = details.httpStatusCode;

  if (
    status === 403 ||
    text.includes('accessdenied') ||
    text.includes('access denied')
  ) {
    return 'Object upload was denied. Check that the storage access key belongs to the same account, can write objects to the bucket, and uses the expected bucket name/endpoint.';
  }

  if (
    status === 401 ||
    text.includes('signature') ||
    text.includes('credential')
  ) {
    return 'Storage credentials were rejected. Check the access key id, secret access key, account id, endpoint, and system clock.';
  }

  if (
    status === 404 ||
    text.includes('nosuchbucket') ||
    text.includes('not found')
  ) {
    return 'Storage bucket was not found by the selected provider. Check the bucket name and account/project.';
  }

  return null;
}

function addIfPresent(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function logStorageInfo(event: string, details: Record<string, unknown>) {
  console.info(`[sherin:storage] ${event}`, details);
}

function logStorageWarn(event: string, details: Record<string, unknown>) {
  console.warn(`[sherin:storage] ${event}`, details);
}

function logStorageError(event: string, details: Record<string, unknown>) {
  console.error(`[sherin:storage] ${event}`, details);
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readLimitedBody(response: Response, contentType: string) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Generated asset response did not include a body.');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;

    assertAssetByteLimit(totalBytes, contentType);

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function assertAssetByteLimit(byteLength: number, contentType = 'image/jpeg') {
  const limit = contentType.startsWith('video/')
    ? MAX_VIDEO_ASSET_BYTES
    : MAX_ASSET_BYTES;

  if (byteLength > limit) {
    throw new Error(`Generated asset exceeds ${formatBytes(limit)} limit.`);
  }
}

async function assertUserStorageQuota(
  userId: string,
  incomingBytes: number,
  reservedBytes = 0,
) {
  const quotaBytes = getUserStorageQuotaBytes();
  const usedBytes = await getUserStoredBytes(userId);

  if (usedBytes + reservedBytes + incomingBytes <= quotaBytes) {
    return;
  }

  throw new Error(
    `User storage quota exceeded: ${formatBytes(usedBytes)} used, ${formatBytes(reservedBytes)} pending, ${formatBytes(incomingBytes)} incoming, ${formatBytes(quotaBytes)} quota.`,
  );
}

function getUserStorageQuotaBytes() {
  const quotaGb =
    getOptionalPositiveIntEnv('CUSTOM_USER_STORAGE_QUOTA_GB') ??
    DEFAULT_USER_STORAGE_QUOTA_GB;

  return quotaGb * BYTES_PER_GB;
}

async function getUserStoredBytes(userId: string) {
  const admin = createSupabaseAdminClient();
  let from = 0;
  let total = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from('generations')
      .select('storage_bytes')
      .eq('user_id', userId)
      .gt('storage_bytes', 0)
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = data ?? [];

    for (const row of rows) {
      total += typeof row.storage_bytes === 'number' ? row.storage_bytes : 0;
    }

    if (rows.length < pageSize) {
      return total;
    }

    from += pageSize;
  }
}

function formatBytes(bytes: number) {
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  return `${bytes} bytes`;
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'video/mp4') return 'mp4';
  return 'bin';
}
