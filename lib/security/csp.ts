const isProduction = process.env.NODE_ENV === 'production';
const BABYSEA_CDN_ORIGIN = 'https://cdn.babysea.live';

export const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
  { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
];

export const API_SECURITY_HEADERS = [
  {
    key: 'Cache-Control',
    value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
  },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
];

/**
 * Builds app's static CSP from the active deployment environment.
 * App is a single private starter, so a small static policy in next.config
 * keeps the same allowlist discipline without needing middleware nonce
 * plumbing. The CSP applies to HTML responses; JSON API responses under
 * /api/* receive Cache-Control headers via API_SECURITY_HEADERS.
 */
function buildContentSecurityPolicy() {
  const connectHosts = new Set<string>([
    "'self'",
    'https://api.us.babysea.ai', // us-region
    'https://api.eu.babysea.ai', // eu-region
    'https://api.jp.babysea.ai', // apac-region
    'https://dashscope-intl.aliyuncs.com', // singapore
  ]);
  const imageHosts = new Set<string>([
    "'self'",
    'data:',
    'blob:',
    'https://app.us.babysea.ai', // us-region
    'https://app.eu.babysea.ai', // eu-region
    'https://app.jp.babysea.ai', // apac-region
    'https://*.aliyuncs.com', // oss results
    'https://lh3.googleusercontent.com', // Google profile photos from Google OAuth
    BABYSEA_CDN_ORIGIN, // app assets
    'https://imagedelivery.net', // app assets
  ]);
  const scriptHosts = new Set<string>([
    "'self'",
    "'unsafe-inline'",
    BABYSEA_CDN_ORIGIN, // app assets
  ]);

  appendSupabaseConnectHosts(
    connectHosts,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  appendAwsS3PublicReadHostFromUrl(imageHosts, {
    bucket: process.env.AWS_S3_BUCKET_NAME,
    endpointUrl: process.env.AWS_S3_ENDPOINT_URL,
    region: process.env.AWS_S3_REGION,
  });

  if (isBackblazeB2Configured()) {
    imageHosts.add('https://*.backblazeb2.com');
  }

  appendR2PublicReadHostFromUrl(
    imageHosts,
    process.env.CLOUDFLARE_R2_CUSTOM_DOMAIN_URL,
  );
  appendHostFromUrl(imageHosts, process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    imageHosts.add('https://*.public.blob.vercel-storage.com');
  }

  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (sentryDsn) {
    appendHostFromUrl(connectHosts, sentryDsn);
  }

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': Array.from(scriptHosts),
    'script-src-elem': Array.from(scriptHosts),
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': Array.from(imageHosts),
    'media-src': Array.from(imageHosts),
    'font-src': ["'self'", 'data:'],
    'connect-src': Array.from(connectHosts),
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };

  if (isProduction) {
    directives['upgrade-insecure-requests'] = [];
  }

  return Object.entries(directives)
    .map(([directive, sources]) =>
      sources.length > 0 ? `${directive} ${sources.join(' ')}` : directive,
    )
    .join('; ');
}

function appendSupabaseConnectHosts(set: Set<string>, raw: string | undefined) {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return;
    }

    set.add(`${url.protocol}//${url.host}`);
    set.add(`${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
  } catch {
    // ignore invalid URLs; CSP simply will not include them.
  }
}

function appendHostFromUrl(set: Set<string>, raw: string | undefined) {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return;
    }

    set.add(`${url.protocol}//${url.host}`);
  } catch {
    // ignore invalid URLs; CSP simply will not include them.
  }
}

function isBackblazeB2Configured() {
  const keyId = process.env.BACKBLAZE_B2_KEY_ID ?? process.env.B2_KEY_ID;
  const applicationKey =
    process.env.BACKBLAZE_B2_APPLICATION_KEY ??
    process.env.BACKBLAZE_B2_APP_KEY ??
    process.env.B2_APP_KEY;
  const bucketName =
    process.env.BACKBLAZE_B2_BUCKET_NAME ?? process.env.B2_BUCKET_NAME;

  return Boolean(keyId?.trim() && applicationKey?.trim() && bucketName?.trim());
}

function appendR2PublicReadHostFromUrl(
  set: Set<string>,
  raw: string | undefined,
) {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return;
  }

  try {
    const url = new URL(trimmed);

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase().endsWith('.r2.cloudflarestorage.com')
    ) {
      return;
    }

    set.add(`${url.protocol}//${url.host}`);
  } catch {
    // ignore invalid URLs; CSP simply will not include them.
  }
}

function appendAwsS3PublicReadHostFromUrl(
  set: Set<string>,
  input: {
    bucket: string | undefined;
    endpointUrl: string | undefined;
    region: string | undefined;
  },
) {
  const endpointUrl = input.endpointUrl?.trim();
  const bucket = input.bucket?.trim();
  const region = input.region?.trim();

  if (!endpointUrl || !bucket || !region) {
    return;
  }

  try {
    const url = new URL(endpointUrl);

    if (url.protocol !== 'https:') {
      return;
    }

    const hostname = url.hostname.toLowerCase();
    const bucketHostSuffix = awsS3BucketHostSuffix(hostname, bucket);

    if (bucketHostSuffix || !isAwsS3ServiceHost(hostname)) {
      set.add(`${url.protocol}//${url.host}`);
      return;
    }

    const endpointBucket = bucketFromAwsEndpointPath(url.pathname);

    if (endpointBucket) {
      set.add(`${url.protocol}//${url.host}`);
      return;
    }

    set.add(`${url.protocol}//${bucket}.${regionalAwsS3ServiceHost(region)}`);
  } catch {
    // ignore invalid URLs; CSP simply will not include them.
  }
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

function bucketFromAwsEndpointPath(pathname: string) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');

  if (!trimmed) {
    return null;
  }

  return trimmed.includes('/') ? null : decodeURIComponent(trimmed);
}
