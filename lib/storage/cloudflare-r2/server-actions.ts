import 'server-only';

import { getOptionalEnv, requireEnv } from '@/lib/utils/env';
import {
  createS3CompatibleStorageProvider,
  type S3CompatibleStorageConfig,
} from '../s3-compatible-storage';
import type { StorageProvider } from '../types';

export function isCloudflareR2StorageConfigured() {
  return Boolean(
    getOptionalEnv('CLOUDFLARE_R2_ACCOUNT_ID') &&
    getOptionalEnv('CLOUDFLARE_R2_ACCESS_KEY_ID') &&
    getOptionalEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY') &&
    getOptionalEnv('CLOUDFLARE_R2_BUCKET_NAME') &&
    getOptionalEnv('CLOUDFLARE_R2_ENDPOINT_URL') &&
    getOptionalEnv('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL'),
  );
}

export function createCloudflareR2StorageProvider(): StorageProvider {
  const accountId = requireEnv('CLOUDFLARE_R2_ACCOUNT_ID');
  const bucket = requireEnv('CLOUDFLARE_R2_BUCKET_NAME');
  const endpoint = requireEnv('CLOUDFLARE_R2_ENDPOINT_URL');
  const customDomainUrl = requireEnv('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL');
  const r2Endpoint = parseCloudflareR2Endpoint(endpoint, accountId, bucket);
  const config: S3CompatibleStorageConfig = {
    region: 'auto',
    endpoint: r2Endpoint.s3Endpoint,
    accessKeyId: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    bucket,
    publicBaseUrl: parseCloudflareR2CustomDomainUrl(customDomainUrl),
    forcePathStyle: true,
  };

  return createS3CompatibleStorageProvider({
    id: 'cloudflare-r2',
    label: `cloudflare-r2 · ${config.bucket}`,
    config,
  });
}

function parseCloudflareR2Endpoint(
  endpoint: string,
  accountId: string,
  bucket: string,
) {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('CLOUDFLARE_R2_ENDPOINT_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('CLOUDFLARE_R2_ENDPOINT_URL must use HTTPS.');
  }

  validateCloudflareR2EndpointHost(url, accountId);

  const endpointBucket = bucketFromEndpointPath(url.pathname);

  if (endpointBucket && endpointBucket !== bucket) {
    throw new Error(
      'CLOUDFLARE_R2_ENDPOINT_URL bucket path must match CLOUDFLARE_R2_BUCKET_NAME.',
    );
  }

  const s3Url = new URL(url);
  s3Url.pathname = '';
  s3Url.search = '';
  s3Url.hash = '';

  return {
    s3Endpoint: s3Url.toString().replace(/\/+$/, ''),
  };
}

function parseCloudflareR2CustomDomainUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL must use HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error(
      'CLOUDFLARE_R2_CUSTOM_DOMAIN_URL must not include credentials.',
    );
  }

  if (url.hostname.toLowerCase().endsWith('.r2.cloudflarestorage.com')) {
    throw new Error(
      'CLOUDFLARE_R2_CUSTOM_DOMAIN_URL must be an R2 Public Development URL or custom domain, not the Cloudflare R2 S3 API endpoint.',
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}

function validateCloudflareR2EndpointHost(url: URL, accountId: string) {
  const hostname = url.hostname.toLowerCase();
  const normalizedAccountId = accountId.toLowerCase();
  const isCloudflareR2Host =
    hostname.startsWith(`${normalizedAccountId}.`) &&
    hostname.endsWith('.r2.cloudflarestorage.com');

  if (url.username || url.password) {
    throw new Error('CLOUDFLARE_R2_ENDPOINT_URL must not include credentials.');
  }

  if (!isCloudflareR2Host) {
    throw new Error(
      'CLOUDFLARE_R2_ENDPOINT_URL must be the Cloudflare R2 S3 API endpoint for CLOUDFLARE_R2_ACCOUNT_ID, not an R2 public or custom domain.',
    );
  }
}

function bucketFromEndpointPath(pathname: string) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('/')) {
    throw new Error(
      'CLOUDFLARE_R2_ENDPOINT_URL can include only the bucket path, for example https://<account-id>.eu.r2.cloudflarestorage.com/sherin.',
    );
  }

  return decodeURIComponent(trimmed);
}
