import 'server-only';

import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import type { createSupabaseAdminClient } from '@/lib/database/admin';
import {
  MAX_VIDEO_ASSET_BYTES,
  persistInputReferenceAsset,
  resolveStoredAssetUrl,
  type PersistedStorageAsset,
  type StorageProviderId,
} from '@/lib/storage';
import { SHERIN_BUCKET } from '@/lib/storage/supabase-storage/server-actions';

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type InputFileUploadContentType = keyof typeof INPUT_FILE_UPLOAD_EXTENSIONS;
type InputVideoFileUploadContentType =
  keyof typeof INPUT_VIDEO_FILE_UPLOAD_EXTENSIONS;
export type InputFileSource = 'upload' | 'url';
export type StoredInputFileAsset = {
  byteLength: number;
  contentType: string;
  fallbackFromProviderId?: StorageProviderId;
  fallbackReason?: string;
  originalUrl?: string;
  publicUrl: string | null;
  source: InputFileSource;
  storagePath: string;
  storageProvider: StorageProviderId;
  url: string;
};

export const MAX_INPUT_FILE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES = MAX_VIDEO_ASSET_BYTES;

const INPUT_FILE_UPLOAD_FOLDER = 'user-upload';
const INPUT_FILE_FETCH_TIMEOUT_MS = 20_000;
const INPUT_FILE_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
const INPUT_FILE_UPLOAD_EXTENSIONS = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
const INPUT_VIDEO_FILE_UPLOAD_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
} as const;

export class InvalidInputFileUploadError extends Error {
  constructor(
    message: string,
    readonly feedback:
      'invalid_input' | 'input_upload_invalid' = 'input_upload_invalid',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'InvalidInputFileUploadError';
  }
}

export async function persistUploadedInputFile(input: {
  file: File;
  generationId: string;
  index: number;
  reservedBytes?: number;
  userId: string;
}) {
  const { file, generationId, index, reservedBytes, userId } = input;

  if (file.size <= 0 || file.size > MAX_INPUT_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input image size.');
  }

  const contentType = normalizeInputFileUploadContentType(file);

  if (!contentType) {
    throw new InvalidInputFileUploadError('Invalid input image type.');
  }

  const data = Buffer.from(await file.arrayBuffer());

  if (data.length <= 0 || data.length > MAX_INPUT_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input image data.');
  }

  if (!isValidInputImagePayload(data, contentType)) {
    throw new InvalidInputFileUploadError('Invalid input image payload.');
  }

  return persistInputFileAsset({
    byteLength: data.byteLength,
    contentType,
    data,
    extension: INPUT_FILE_UPLOAD_EXTENSIONS[contentType],
    generationId,
    index,
    remoteHost: 'local-upload',
    reservedBytes,
    source: 'upload',
    userId,
  });
}

export async function persistUploadedInputVideoFile(input: {
  file: File;
  generationId: string;
  index: number;
  reservedBytes?: number;
  userId: string;
}) {
  const { file, generationId, index, reservedBytes, userId } = input;

  if (file.size <= 0 || file.size > MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input video size.');
  }

  const contentType = normalizeInputVideoFileUploadContentType(file);

  if (!contentType) {
    throw new InvalidInputFileUploadError('Invalid input video type.');
  }

  const data = Buffer.from(await file.arrayBuffer());

  if (data.length <= 0 || data.length > MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input video data.');
  }

  if (!isValidInputVideoPayload(data, contentType)) {
    throw new InvalidInputFileUploadError('Invalid input video payload.');
  }

  return persistInputFileAsset({
    byteLength: data.byteLength,
    contentType,
    data,
    extension: INPUT_VIDEO_FILE_UPLOAD_EXTENSIONS[contentType],
    generationId,
    index,
    remoteHost: 'local-upload',
    reservedBytes,
    source: 'upload',
    userId,
  });
}

export async function persistUrlInputFile(input: {
  generationId: string;
  index: number;
  reservedBytes?: number;
  url: string;
  userId: string;
}) {
  const url = parseInputFileUrl(input.url);
  const response = await downloadInputFileUrl(url);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new InvalidInputFileUploadError(
      `Could not download input image URL: ${response.statusCode}.`,
      'invalid_input',
    );
  }

  const contentType = normalizeRemoteInputFileContentType(
    responseHeader(response.headers, 'content-type'),
    url,
  );

  if (!contentType) {
    throw new InvalidInputFileUploadError('Invalid input image type.');
  }

  const contentLength = parseContentLength(
    responseHeader(response.headers, 'content-length'),
  );

  if (contentLength !== null && contentLength > MAX_INPUT_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input image size.');
  }

  const data = response.data;

  if (data.byteLength <= 0 || data.byteLength > MAX_INPUT_FILE_UPLOAD_BYTES) {
    throw new InvalidInputFileUploadError('Invalid input image data.');
  }

  if (!isValidInputImagePayload(data, contentType)) {
    throw new InvalidInputFileUploadError('Invalid input image payload.');
  }

  return persistInputFileAsset({
    byteLength: data.byteLength,
    contentType,
    data,
    extension: INPUT_FILE_UPLOAD_EXTENSIONS[contentType],
    generationId: input.generationId,
    index: input.index,
    originalUrl: url.toString(),
    remoteHost: url.hostname,
    reservedBytes: input.reservedBytes,
    source: 'url',
    userId: input.userId,
  });
}

export async function persistUrlInputVideoFile(input: {
  generationId: string;
  index: number;
  reservedBytes?: number;
  url: string;
  userId: string;
}) {
  const url = parseInputFileUrl(input.url, 'video');
  const response = await downloadInputFileUrl(
    url,
    MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES,
    'video',
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new InvalidInputFileUploadError(
      `Could not download input video URL: ${response.statusCode}.`,
      'invalid_input',
    );
  }

  const contentType = normalizeRemoteInputVideoFileContentType(
    responseHeader(response.headers, 'content-type'),
    url,
  );

  if (!contentType) {
    throw new InvalidInputFileUploadError('Invalid input video type.');
  }

  const contentLength = parseContentLength(
    responseHeader(response.headers, 'content-length'),
  );

  if (
    contentLength !== null &&
    contentLength > MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES
  ) {
    throw new InvalidInputFileUploadError('Invalid input video size.');
  }

  const data = response.data;

  if (
    data.byteLength <= 0 ||
    data.byteLength > MAX_INPUT_VIDEO_FILE_UPLOAD_BYTES
  ) {
    throw new InvalidInputFileUploadError('Invalid input video data.');
  }

  if (!isValidInputVideoPayload(data, contentType)) {
    throw new InvalidInputFileUploadError('Invalid input video payload.');
  }

  return persistInputFileAsset({
    byteLength: data.byteLength,
    contentType,
    data,
    extension: INPUT_VIDEO_FILE_UPLOAD_EXTENSIONS[contentType],
    generationId: input.generationId,
    index: input.index,
    originalUrl: url.toString(),
    remoteHost: url.hostname,
    reservedBytes: input.reservedBytes,
    source: 'url',
    userId: input.userId,
  });
}

async function persistInputFileAsset(input: {
  byteLength: number;
  contentType: InputFileUploadContentType | InputVideoFileUploadContentType;
  data: Uint8Array;
  extension: string;
  generationId: string;
  index: number;
  originalUrl?: string;
  remoteHost: string;
  reservedBytes?: number;
  source: InputFileSource;
  userId: string;
}): Promise<StoredInputFileAsset> {
  const stored = await persistInputReferenceAsset(input);
  const storedUrl = await resolveInputReferenceUrl(stored);
  const url = providerFacingInputAssetUrl({
    originalUrl: input.originalUrl,
    source: input.source,
    storedUrl,
  });

  if (!url) {
    throw new Error('Stored input media did not return a readable URL.');
  }

  if (!isHttpsUrl(url)) {
    throw new InvalidInputFileUploadError(
      'Stored input media URL must use HTTPS.',
      'invalid_input',
    );
  }

  return toStoredInputFileAsset(stored, input.source, url, input.originalUrl);
}

async function resolveInputReferenceUrl(asset: PersistedStorageAsset) {
  return resolveStoredAssetUrl({
    publicUrl: asset.publicUrl,
    storagePath: asset.storagePath,
    storageProvider: asset.providerId,
  });
}

function providerFacingInputAssetUrl({
  originalUrl,
  source,
  storedUrl,
}: {
  originalUrl?: string;
  source: InputFileSource;
  storedUrl: string | null;
}) {
  if (storedUrl && isHttpsUrl(storedUrl)) {
    return storedUrl;
  }

  if (source === 'url' && originalUrl) {
    return originalUrl;
  }

  return storedUrl;
}

function toStoredInputFileAsset(
  stored: PersistedStorageAsset,
  source: InputFileSource,
  url: string,
  originalUrl?: string,
): StoredInputFileAsset {
  return {
    byteLength: stored.byteLength,
    contentType: stored.contentType,
    ...(stored.fallbackFromProviderId
      ? { fallbackFromProviderId: stored.fallbackFromProviderId }
      : {}),
    ...(stored.fallbackReason ? { fallbackReason: stored.fallbackReason } : {}),
    ...(originalUrl ? { originalUrl } : {}),
    publicUrl: stored.publicUrl,
    source,
    storagePath: stored.storagePath,
    storageProvider: stored.providerId,
    url,
  };
}

export async function createSignedInputFileUrls(
  admin: SupabaseAdminClient,
  userId: string,
  storagePaths: string[],
) {
  const urls: string[] = [];

  for (const storagePath of storagePaths) {
    assertInputFileUploadPath(storagePath, userId);

    const { data, error } = await admin.storage
      .from(SHERIN_BUCKET)
      .createSignedUrl(storagePath, INPUT_FILE_SIGNED_URL_TTL_SECONDS);

    if (error) {
      throw error;
    }

    if (!data?.signedUrl) {
      throw new Error('Supabase did not return a signed input image URL.');
    }

    if (!isHttpsUrl(data.signedUrl)) {
      throw new InvalidInputFileUploadError(
        'Supabase signed input image URL must use HTTPS.',
        'invalid_input',
      );
    }

    urls.push(data.signedUrl);
  }

  return urls;
}

export async function createInputFileAssetUrls(
  assets: readonly StoredInputFileAsset[],
) {
  const urls: string[] = [];

  for (const asset of assets) {
    const storedUrl = await resolveInputReferenceUrl({
      byteLength: asset.byteLength,
      contentType: asset.contentType,
      fallbackFromProviderId: asset.fallbackFromProviderId,
      fallbackReason: asset.fallbackReason,
      providerId: asset.storageProvider,
      publicUrl: asset.publicUrl,
      storagePath: asset.storagePath,
    });
    const url = providerFacingInputAssetUrl({
      originalUrl: asset.originalUrl,
      source: asset.source,
      storedUrl,
    });

    if (!url) {
      throw new Error('Stored input media did not return a readable URL.');
    }

    if (!isHttpsUrl(url)) {
      throw new InvalidInputFileUploadError(
        asset.source === 'url'
          ? 'Original input media URL must use HTTPS.'
          : 'Stored input media URL must use HTTPS.',
        'invalid_input',
      );
    }

    urls.push(url);
  }

  return urls;
}

export async function cleanupInputFileUploads(
  admin: SupabaseAdminClient,
  userId: string,
  storagePaths: string[],
) {
  let allStoragePathsSafe = true;
  const safeStoragePaths = storagePaths.filter((storagePath) =>
    isInputFileUploadPath(storagePath, userId),
  );

  if (safeStoragePaths.length !== storagePaths.length) {
    allStoragePathsSafe = false;
    console.warn('Skipped unsafe input image upload cleanup path.');
  }

  if (safeStoragePaths.length === 0) {
    return allStoragePathsSafe;
  }

  const { error } = await admin.storage
    .from(SHERIN_BUCKET)
    .remove(safeStoragePaths);

  if (error) {
    console.warn('Could not remove input image uploads after failure', error);

    return false;
  }

  return allStoragePathsSafe;
}

function assertInputFileUploadPath(storagePath: string, userId: string) {
  if (!isInputFileUploadPath(storagePath, userId)) {
    throw new InvalidInputFileUploadError(
      'Invalid input image upload storage path.',
      'invalid_input',
    );
  }
}

function isInputFileUploadPath(storagePath: string, userId: string) {
  const prefix = `${INPUT_FILE_UPLOAD_FOLDER}/${userId}/`;

  if (!storagePath.startsWith(prefix)) {
    return false;
  }

  const fileName = storagePath.slice(prefix.length);

  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/input-\d+\.(gif|jpg|mov|mp4|png|webm|webp)$/.test(
    fileName,
  );
}

function normalizeInputFileUploadContentType(file: File) {
  const directContentType = normalizeKnownInputFileContentType(file.type);

  if (directContentType) {
    return directContentType;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'gif':
      return 'image/gif';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function normalizeInputVideoFileUploadContentType(file: File) {
  const directContentType = normalizeKnownInputVideoFileContentType(file.type);

  if (directContentType) {
    return directContentType;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();

  return normalizeKnownInputVideoFileExtension(extension);
}

function normalizeRemoteInputFileContentType(value: string | null, url: URL) {
  const directContentType = normalizeKnownInputFileContentType(
    value?.split(';')[0] ?? '',
  );

  if (directContentType) {
    return directContentType;
  }

  return normalizeKnownInputFileExtension(
    url.pathname.split('/').pop()?.split('.').pop()?.toLowerCase(),
  );
}

function normalizeRemoteInputVideoFileContentType(
  value: string | null,
  url: URL,
) {
  const directContentType = normalizeKnownInputVideoFileContentType(
    value?.split(';')[0] ?? '',
  );

  if (directContentType) {
    return directContentType;
  }

  return normalizeKnownInputVideoFileExtension(
    url.pathname.split('/').pop()?.split('.').pop()?.toLowerCase(),
  );
}

function normalizeKnownInputFileContentType(
  value: string,
): InputFileUploadContentType | null {
  const contentType = value.toLowerCase().trim();

  if (contentType === 'image/jpg') {
    return 'image/jpeg';
  }

  if (contentType in INPUT_FILE_UPLOAD_EXTENSIONS) {
    return contentType as InputFileUploadContentType;
  }

  return null;
}

function normalizeKnownInputVideoFileContentType(
  value: string,
): InputVideoFileUploadContentType | null {
  const contentType = value.toLowerCase().trim();

  if (contentType === 'video/x-m4v') {
    return 'video/quicktime';
  }

  if (contentType in INPUT_VIDEO_FILE_UPLOAD_EXTENSIONS) {
    return contentType as InputVideoFileUploadContentType;
  }

  return null;
}

function normalizeKnownInputFileExtension(
  extension: string | undefined,
): InputFileUploadContentType | null {
  switch (extension) {
    case 'gif':
      return 'image/gif';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function normalizeKnownInputVideoFileExtension(
  extension: string | undefined,
): InputVideoFileUploadContentType | null {
  switch (extension) {
    case 'm4v':
    case 'mov':
      return 'video/quicktime';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return null;
  }
}

function parseInputFileUrl(value: string, inputLabel = 'image') {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new InvalidInputFileUploadError(
      `Input ${inputLabel} URL must be a valid URL.`,
      'invalid_input',
    );
  }

  if (url.protocol !== 'https:') {
    throw new InvalidInputFileUploadError(
      `Input ${inputLabel} URL must use HTTPS.`,
      'invalid_input',
    );
  }

  if (url.username || url.password) {
    throw new InvalidInputFileUploadError(
      `Input ${inputLabel} URL must not include credentials.`,
      'invalid_input',
    );
  }

  if (isLocalOrPrivateHost(url.hostname)) {
    throw new InvalidInputFileUploadError(
      `Input ${inputLabel} URL host is not allowed.`,
      'invalid_input',
    );
  }

  return url;
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(host);

  if (ipVersion === 6) {
    return isLocalOrPrivateIpv6(host);
  }

  if (ipVersion !== 4) {
    return false;
  }

  return isLocalOrPrivateIpv4(host);
}

function isLocalOrPrivateIpv4(host: string) {
  const octets = host.split('.').map(Number);

  if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) {
    return true;
  }

  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;

  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isLocalOrPrivateIpv6(host: string) {
  if (host === '::' || host === '::1') {
    return true;
  }

  const embeddedIpv4 = host.split(':').find((part) => part.includes('.'));

  if (embeddedIpv4 && isLocalOrPrivateIpv4(embeddedIpv4)) {
    return true;
  }

  const firstPart = host.split(':')[0] || '0';
  const secondPart = host.split(':')[1] || '0';
  const first = Number.parseInt(firstPart, 16);
  const second = Number.parseInt(secondPart, 16);

  if (!Number.isFinite(first)) {
    return true;
  }

  return (
    first === 0 ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf) ||
    (first >= 0xff00 && first <= 0xffff) ||
    (first === 0x2001 && second === 0x0db8)
  );
}

function downloadInputFileUrl(
  url: URL,
  maxBytes = MAX_INPUT_FILE_UPLOAD_BYTES,
  inputLabel = 'image',
) {
  return new Promise<{
    data: Uint8Array;
    headers: IncomingHttpHeaders;
    statusCode: number;
  }>((resolve, reject) => {
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const request = httpsRequest(
      url,
      {
        headers: inputDownloadHeaders(inputLabel),
        lookup: lookupPublicInputHost,
        method: 'GET',
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if (isRedirectStatus(statusCode)) {
          response.destroy();
          fail(
            new InvalidInputFileUploadError(
              `Input ${inputLabel} URL redirects are not allowed.`,
              'invalid_input',
            ),
          );
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.destroy();
          complete({
            data: new Uint8Array(),
            headers: response.headers,
            statusCode,
          });
          request.destroy();
          return;
        }

        const contentLength = parseContentLength(
          responseHeader(response.headers, 'content-length'),
        );

        if (contentLength !== null && contentLength > maxBytes) {
          response.destroy();
          fail(
            new InvalidInputFileUploadError(
              `Invalid input ${inputLabel} size.`,
            ),
          );
          return;
        }

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;

          if (totalBytes > maxBytes) {
            response.destroy();
            fail(
              new InvalidInputFileUploadError(
                `Invalid input ${inputLabel} size.`,
              ),
            );
            return;
          }

          chunks.push(buffer);
        });

        response.on('end', () => {
          complete({
            data: Buffer.concat(chunks, totalBytes),
            headers: response.headers,
            statusCode,
          });
        });

        response.on('error', fail);
      },
    );

    deadline = setTimeout(() => {
      fail(
        new InvalidInputFileUploadError(
          `Input ${inputLabel} URL timed out.`,
          'invalid_input',
        ),
      );
    }, INPUT_FILE_FETCH_TIMEOUT_MS);
    request.setTimeout(INPUT_FILE_FETCH_TIMEOUT_MS, () => {
      fail(
        new InvalidInputFileUploadError(
          `Input ${inputLabel} URL timed out.`,
          'invalid_input',
        ),
      );
    });
    request.on('error', fail);
    request.end();

    function complete(result: {
      data: Uint8Array;
      headers: IncomingHttpHeaders;
      statusCode: number;
    }) {
      if (settled) {
        return;
      }

      settled = true;
      clearDownloadDeadline();
      resolve(result);
    }

    function fail(error: unknown) {
      if (settled) {
        return;
      }

      settled = true;
      clearDownloadDeadline();
      request.destroy();

      if (error instanceof InvalidInputFileUploadError) {
        reject(error);
        return;
      }

      reject(
        new InvalidInputFileUploadError(
          `Could not download input ${inputLabel} URL.`,
          'invalid_input',
          error,
        ),
      );
    }

    function clearDownloadDeadline() {
      if (!deadline) {
        return;
      }

      clearTimeout(deadline);
      deadline = null;
    }
  });
}

function inputDownloadHeaders(inputLabel: string) {
  return {
    accept: inputLabel === 'video' ? 'video/*,*/*;q=0.8' : 'image/*,*/*;q=0.8',
    'user-agent': 'Sherin/1.0 (+https://babysea.ai)',
  };
}

const lookupPublicInputHost = ((
  hostname: string,
  optionsOrCallback: unknown,
  maybeCallback?: unknown,
) => {
  const options =
    typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const callback =
    typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

  if (typeof callback !== 'function') {
    return;
  }

  void resolvePublicInputHost(hostname)
    .then((address) => {
      if (isLookupAllOptions(options)) {
        callback(null, [address]);
        return;
      }

      callback(null, address.address, address.family);
    })
    .catch((error) => {
      if (isLookupAllOptions(options)) {
        callback(error as NodeJS.ErrnoException, []);
        return;
      }

      callback(error as NodeJS.ErrnoException, '', 0);
    });
}) as LookupFunction;

function isLookupAllOptions(value: unknown) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'all' in value &&
    (value as { all?: unknown }).all === true,
  );
}

async function resolvePublicInputHost(hostname: string) {
  if (isLocalOrPrivateHost(hostname)) {
    throw new InvalidInputFileUploadError(
      'Input media URL host is not allowed.',
      'invalid_input',
    );
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new InvalidInputFileUploadError(
      'Input media URL host could not be verified.',
      'invalid_input',
    );
  }

  if (addresses.some((address) => isLocalOrPrivateHost(address.address))) {
    throw new InvalidInputFileUploadError(
      'Input media URL host resolves to a private address.',
      'invalid_input',
    );
  }

  return addresses.find((address) => address.family === 4) ?? addresses[0]!;
}

function responseHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}

function isRedirectStatus(statusCode: number) {
  return statusCode >= 300 && statusCode < 400;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isValidInputImagePayload(
  data: Uint8Array,
  contentType: InputFileUploadContentType,
) {
  switch (contentType) {
    case 'image/gif':
      return isGifPayload(data);
    case 'image/jpeg':
      return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8;
    case 'image/png':
      return startsWithBytes(
        data,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case 'image/webp':
      return (
        data.length >= 12 &&
        startsWithBytes(data, [0x52, 0x49, 0x46, 0x46]) &&
        startsWithBytes(data.subarray(8), [0x57, 0x45, 0x42, 0x50])
      );
  }
}

function isValidInputVideoPayload(
  data: Uint8Array,
  contentType: InputVideoFileUploadContentType,
) {
  switch (contentType) {
    case 'video/mp4':
    case 'video/quicktime':
      return isIsoBaseMediaPayload(data);
    case 'video/webm':
      return startsWithBytes(data, [0x1a, 0x45, 0xdf, 0xa3]);
  }
}

function isIsoBaseMediaPayload(data: Uint8Array) {
  return (
    data.length >= 12 &&
    startsWithBytes(data.subarray(4), [0x66, 0x74, 0x79, 0x70])
  );
}

function isGifPayload(data: Uint8Array) {
  return (
    data.length >= 6 &&
    (startsWithBytes(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWithBytes(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  );
}

function startsWithBytes(data: Uint8Array, bytes: number[]) {
  if (data.length < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => data[index] === byte);
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
