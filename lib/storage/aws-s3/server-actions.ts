import 'server-only';

import { getOptionalEnv, requireEnv } from '@/lib/utils/env';
import {
  createS3CompatibleStorageProvider,
  type S3CompatibleStorageConfig,
} from '../s3-compatible-storage';
import type { StorageProvider } from '../types';

export function isAwsS3StorageConfigured() {
  return Boolean(
    getOptionalEnv('AWS_S3_REGION') &&
    getOptionalEnv('AWS_S3_ACCESS_KEY_ID') &&
    getOptionalEnv('AWS_S3_SECRET_ACCESS_KEY') &&
    getOptionalEnv('AWS_S3_BUCKET_NAME') &&
    getOptionalEnv('AWS_S3_ENDPOINT_URL'),
  );
}

export function createAwsS3StorageProvider(): StorageProvider {
  const region = requireEnv('AWS_S3_REGION');
  const bucket = requireEnv('AWS_S3_BUCKET_NAME');
  const endpointConfig = resolveAwsS3EndpointConfig({
    bucket,
    endpointUrl: requireEnv('AWS_S3_ENDPOINT_URL'),
    region,
  });
  const config: S3CompatibleStorageConfig = {
    region,
    endpoint: endpointConfig.clientEndpoint,
    accessKeyId: requireEnv('AWS_S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_S3_SECRET_ACCESS_KEY'),
    bucket,
    publicBaseUrl: endpointConfig.publicBaseUrl,
    forcePathStyle: false,
  };

  return createS3CompatibleStorageProvider({
    id: 'aws-s3',
    label: `aws-s3 · ${config.bucket}`,
    config,
  });
}

export function resolveAwsS3EndpointConfig(input: {
  bucket: string;
  endpointUrl: string;
  region: string;
}) {
  const { bucket, endpointUrl, region } = input;
  let url: URL;

  try {
    url = new URL(endpointUrl);
  } catch {
    throw new Error('AWS_S3_ENDPOINT_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('AWS_S3_ENDPOINT_URL must use HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error('AWS_S3_ENDPOINT_URL must not include credentials.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';

  const hostname = url.hostname.toLowerCase();
  const bucketHostSuffix = awsS3BucketHostSuffix(hostname, bucket);

  if (bucketHostSuffix) {
    if (url.pathname && url.pathname !== '/') {
      throw new Error(
        'AWS_S3_ENDPOINT_URL bucket-host URL must not include a path.',
      );
    }

    return {
      clientEndpoint: `${url.protocol}//${bucketHostSuffix}`,
      publicBaseUrl: url.toString().replace(/\/+$/, ''),
    };
  }

  if (isAwsS3ServiceHost(hostname)) {
    const endpointBucket = bucketFromEndpointPath(url.pathname);
    const clientEndpoint = `${url.protocol}//${url.host}`;

    if (endpointBucket && endpointBucket !== bucket) {
      throw new Error(
        'AWS_S3_ENDPOINT_URL bucket path must match AWS_S3_BUCKET_NAME.',
      );
    }

    return {
      clientEndpoint,
      publicBaseUrl: endpointBucket
        ? `${clientEndpoint}/${encodeURIComponent(endpointBucket)}`
        : `${url.protocol}//${bucket}.${regionalAwsS3ServiceHost(region)}`,
    };
  }

  return {
    clientEndpoint: `${url.protocol}//${regionalAwsS3ServiceHost(region)}`,
    publicBaseUrl: url.toString().replace(/\/+$/, ''),
  };
}

function awsS3BucketHostSuffix(hostname: string, bucket: string) {
  const normalizedBucket = bucket.toLowerCase();

  if (!hostname.startsWith(`${normalizedBucket}.`)) {
    return null;
  }

  const suffix = hostname.slice(normalizedBucket.length + 1);

  return isAwsS3ServiceHost(suffix) ? suffix : null;
}

function isAwsS3ServiceHost(hostname: string) {
  return (
    hostname === 's3.amazonaws.com' ||
    /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(hostname)
  );
}

function regionalAwsS3ServiceHost(region: string) {
  return `s3.${region}.amazonaws.com`;
}

function bucketFromEndpointPath(pathname: string) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('/')) {
    throw new Error(
      'AWS_S3_ENDPOINT_URL can include only the bucket path, for example https://s3.us-east-1.amazonaws.com/sherin.',
    );
  }

  return decodeURIComponent(trimmed);
}
