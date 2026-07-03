#!/usr/bin/env node
// @ts-nocheck

import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const ENV_FILES = ['.env.local', '.env'];
const INFERENCE_PROVIDERS = new Set(['alibaba-cloud', 'babysea']);
const STORAGE_PROVIDERS = new Set([
  'aws-s3',
  'backblaze-b2',
  'cloudflare-r2',
  'supabase-storage',
  'vercel-blob',
]);
const SHERIN_REPOSITORY_URL =
  'https://github.com/babysea-community/sherin-for-qwen';
const SHERIN_VERCEL_DEPLOY_URL =
  'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbabysea-community%2Fsherin-for-qwen&project-name=sherin-for-qwen&repository-name=sherin-for-qwen&env=NEXT_PUBLIC_SITE_URL,OWNER_EMAIL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLIC_KEY,SUPABASE_SECRET_KEY,INFERENCE_PROVIDER,DASHSCOPE_API_KEY,STORAGE_PROVIDER,CUSTOM_USER_STORAGE_QUOTA_GB';
const SHERIN_NETLIFY_DEPLOY_URL = `https://app.netlify.com/start/deploy?repository=${SHERIN_REPOSITORY_URL}`;
const SHERIN_DIGITALOCEAN_DEPLOY_URL = `https://cloud.digitalocean.com/apps/new?repo=${SHERIN_REPOSITORY_URL}/tree/main`;
const SHERIN_RAILWAY_DEPLOY_URL =
  'https://railway.com/deploy/sherin-for-qwen?referralCode=_FJpRb';
const SHERIN_RENDER_DEPLOY_URL = `https://render.com/deploy?repo=${SHERIN_REPOSITORY_URL}`;
const SHERIN_NETLIFY_TEMPLATE_ENV = [
  'NEXT_PUBLIC_SITE_URL',
  'OWNER_EMAIL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLIC_KEY',
  'SUPABASE_SECRET_KEY',
  'INFERENCE_PROVIDER',
  'DASHSCOPE_API_KEY',
  'STORAGE_PROVIDER',
  'CUSTOM_USER_STORAGE_QUOTA_GB',
];

const env = loadEnv();
const checks = [];

checkUrl('NEXT_PUBLIC_SITE_URL', { allowLocalhost: true });
checkEmail('OWNER_EMAIL');
checkUrl('NEXT_PUBLIC_SUPABASE_URL', { allowLocalhost: true });
checkRequired('NEXT_PUBLIC_SUPABASE_PUBLIC_KEY');
checkRequired('SUPABASE_SECRET_KEY');

const preferredInference = optional('INFERENCE_PROVIDER')?.toLowerCase();
const hasBabySea = Boolean(optional('BABYSEA_API_KEY'));
const hasAlibabaCloud = Boolean(optional('DASHSCOPE_API_KEY'));

if (preferredInference && !INFERENCE_PROVIDERS.has(preferredInference)) {
  fail('INFERENCE_PROVIDER must be babysea or alibaba-cloud.');
} else if (preferredInference === 'babysea' && !hasBabySea) {
  fail('INFERENCE_PROVIDER=babysea requires BABYSEA_API_KEY.');
} else if (preferredInference === 'alibaba-cloud' && !hasAlibabaCloud) {
  fail('INFERENCE_PROVIDER=alibaba-cloud requires DASHSCOPE_API_KEY.');
} else if (!hasBabySea && !hasAlibabaCloud) {
  fail('Set BABYSEA_API_KEY or DASHSCOPE_API_KEY.');
} else {
  pass('Inference provider is configured.');
}

const preferredStorage = optional('STORAGE_PROVIDER')?.toLowerCase();
const storageRequirements = {
  'aws-s3': [
    'AWS_S3_REGION',
    'AWS_S3_ACCESS_KEY_ID',
    'AWS_S3_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET_NAME',
    'AWS_S3_ENDPOINT_URL',
  ],
  'cloudflare-r2': [
    'CLOUDFLARE_R2_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCESS_KEY_ID',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_BUCKET_NAME',
    'CLOUDFLARE_R2_ENDPOINT_URL',
    'CLOUDFLARE_R2_CUSTOM_DOMAIN_URL',
  ],
};
const BACKBLAZE_B2_KEY_ID_ENV_NAMES = ['BACKBLAZE_B2_KEY_ID', 'B2_KEY_ID'];
const BACKBLAZE_B2_APPLICATION_KEY_ENV_NAMES = [
  'BACKBLAZE_B2_APPLICATION_KEY',
  'BACKBLAZE_B2_APP_KEY',
  'B2_APP_KEY',
];
const BACKBLAZE_B2_BUCKET_NAME_ENV_NAMES = [
  'BACKBLAZE_B2_BUCKET_NAME',
  'B2_BUCKET_NAME',
];
const storageAvailability = {
  'aws-s3': hasAll(storageRequirements['aws-s3']),
  'backblaze-b2': hasBackblazeB2Config(),
  'cloudflare-r2': hasAll(storageRequirements['cloudflare-r2']),
  'supabase-storage': true,
  'vercel-blob': Boolean(optional('BLOB_READ_WRITE_TOKEN')),
};

if (preferredStorage && !STORAGE_PROVIDERS.has(preferredStorage)) {
  fail(
    'STORAGE_PROVIDER must be aws-s3, backblaze-b2, cloudflare-r2, supabase-storage, or vercel-blob.',
  );
} else if (preferredStorage && !storageAvailability[preferredStorage]) {
  fail('Selected storage provider is missing required env values.');
} else {
  pass('Storage provider is configured.');
}

if (hasAny(storageRequirements['aws-s3'])) {
  checkRequiredGroup('aws-s3', storageRequirements['aws-s3']);
}

if (hasAnyBackblazeB2Config()) {
  checkBackblazeB2Config();
}

if (hasAny(storageRequirements['cloudflare-r2'])) {
  checkRequiredGroup('cloudflare-r2', storageRequirements['cloudflare-r2']);
}

if (optional('AWS_S3_ENDPOINT_URL')) {
  checkUrl('AWS_S3_ENDPOINT_URL');
  checkAwsS3EndpointUrl('AWS_S3_ENDPOINT_URL');
}

if (optional('CLOUDFLARE_R2_ENDPOINT_URL')) {
  checkUrl('CLOUDFLARE_R2_ENDPOINT_URL');
  checkR2EndpointHost('CLOUDFLARE_R2_ENDPOINT_URL');
  checkR2EndpointBucketPath('CLOUDFLARE_R2_ENDPOINT_URL');
}

if (optional('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL')) {
  checkUrl('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL');
  checkNoUrlCredentials('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL');
  checkR2PublicReadHost('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL');
}

if (preferredStorage === 'vercel-blob') {
  pass('vercel-blob storage selected; use Vercel for hosting.');
}

checkOptionalPositiveInteger('CUSTOM_USER_STORAGE_QUOTA_GB');

if (optional('STORAGE_SMOKE_TEST')) {
  await probeStorage();
}

checkDeployButtons();

for (const check of checks) {
  console.log(`${check.ok ? 'OK' : 'ERROR'} ${check.message}`);
}

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}

function loadEnv() {
  const loaded = { ...process.env };

  for (const file of ENV_FILES) {
    const path = resolve(process.cwd(), file);

    if (!existsSync(path)) {
      continue;
    }

    const content = readFileSync(path, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separator = trimmed.indexOf('=');

      if (separator === -1) {
        continue;
      }

      const name = trimmed.slice(0, separator).trim();

      if (!name || loaded[name]) {
        continue;
      }

      loaded[name] = unquote(trimmed.slice(separator + 1).trim());
    }
  }

  return loaded;
}

function readRequiredFile(name) {
  const path = resolve(process.cwd(), name);

  if (!existsSync(path)) {
    throw new Error(`${name} is missing.`);
  }

  return readFileSync(path, 'utf8');
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function optional(name) {
  const value = env[name]?.trim();

  return value ? value : undefined;
}

function firstOptional(names) {
  for (const name of names) {
    const value = optional(name);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function checkRequired(name) {
  if (optional(name)) {
    pass(`${name} is set.`);
  } else {
    fail(`${name} is missing.`);
  }
}

function hasExactHref(source, expectedHref) {
  return new RegExp(`href\\s*=\\s*(['"])${escapeRegExp(expectedHref)}\\1`).test(
    source,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkUrl(name, options = {}) {
  const value = optional(name);

  if (!value) {
    fail(`${name} is missing.`);
    return;
  }

  try {
    const url = new URL(value);
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(
      url.hostname.toLowerCase(),
    );

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      fail(`${name} must use HTTP or HTTPS.`);
      return;
    }

    if (url.protocol !== 'https:' && !(options.allowLocalhost && isLocalhost)) {
      fail(`${name} must use HTTPS outside local development.`);
      return;
    }

    pass(`${name} is valid.`);
  } catch {
    fail(`${name} must be a valid URL.`);
  }
}

function checkR2EndpointBucketPath(name) {
  const value = optional(name);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    const endpointBucket = bucketFromEndpointPath(url.pathname);
    const bucket = optional('CLOUDFLARE_R2_BUCKET_NAME');

    if (!endpointBucket) {
      pass(`${name} bucket path is empty; using CLOUDFLARE_R2_BUCKET_NAME.`);
      return;
    }

    if (!bucket) {
      fail(
        `${name} includes a bucket path, but CLOUDFLARE_R2_BUCKET_NAME is missing.`,
      );
      return;
    }

    if (endpointBucket !== bucket) {
      fail(`${name} bucket path must match CLOUDFLARE_R2_BUCKET_NAME.`);
      return;
    }

    pass(`${name} bucket path matches CLOUDFLARE_R2_BUCKET_NAME.`);
  } catch {
    fail(`${name} bucket path must be valid.`);
  }
}

function checkR2EndpointHost(name) {
  const value = optional(name);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    const accountId = optional('CLOUDFLARE_R2_ACCOUNT_ID');

    if (!accountId) {
      fail(`${name} requires CLOUDFLARE_R2_ACCOUNT_ID to validate host.`);
      return;
    }

    if (url.username || url.password) {
      fail(`${name} must not include credentials.`);
      return;
    }

    const hostname = url.hostname.toLowerCase();
    const normalizedAccountId = accountId.toLowerCase();
    const isCloudflareR2Host =
      hostname.startsWith(`${normalizedAccountId}.`) &&
      hostname.endsWith('.r2.cloudflarestorage.com');

    if (!isCloudflareR2Host) {
      fail(
        `${name} must be the Cloudflare R2 S3 API endpoint for CLOUDFLARE_R2_ACCOUNT_ID, not an R2 public or custom domain.`,
      );
      return;
    }

    pass(`${name} host matches CLOUDFLARE_R2_ACCOUNT_ID.`);
  } catch {
    fail(`${name} host must be valid.`);
  }
}

function checkR2PublicReadHost(name) {
  const value = optional(name);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (hostname.endsWith('.r2.cloudflarestorage.com')) {
      fail(
        `${name} must be an R2 Public Development URL or custom domain, not the Cloudflare R2 S3 API endpoint.`,
      );
      return;
    }

    pass(`${name} is a public-read host.`);
  } catch {
    fail(`${name} public-read host must be valid.`);
  }
}

function checkNoUrlCredentials(name) {
  const value = optional(name);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);

    if (url.username || url.password) {
      fail(`${name} must not include credentials.`);
      return;
    }

    pass(`${name} does not include credentials.`);
  } catch {
    fail(`${name} must be a valid URL.`);
  }
}

function bucketFromEndpointPath(pathname) {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('/')) {
    throw new Error(
      'CLOUDFLARE_R2_ENDPOINT_URL can include only the bucket path at the end.',
    );
  }

  return decodeURIComponent(trimmed);
}

function checkEmail(name) {
  const value = optional(name);

  if (!value) {
    fail(`${name} is missing.`);
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    fail(`${name} must be a valid email address.`);
    return;
  }

  pass(`${name} is valid.`);
}

function checkOptionalPositiveInteger(name) {
  const value = optional(name);

  if (!value) {
    return;
  }

  if (!/^[1-9][0-9]*$/.test(value)) {
    fail(`${name} must be a positive integer.`);
    return;
  }

  pass(`${name} is a positive integer.`);
}

function hasAll(names) {
  return names.every((name) => Boolean(optional(name)));
}

function hasAny(names) {
  return names.some((name) => Boolean(optional(name)));
}

function hasBackblazeB2Config() {
  return Boolean(
    firstOptional(BACKBLAZE_B2_KEY_ID_ENV_NAMES) &&
    firstOptional(BACKBLAZE_B2_APPLICATION_KEY_ENV_NAMES) &&
    firstOptional(BACKBLAZE_B2_BUCKET_NAME_ENV_NAMES),
  );
}

function hasAnyBackblazeB2Config() {
  return Boolean(
    firstOptional(BACKBLAZE_B2_KEY_ID_ENV_NAMES) ||
    firstOptional(BACKBLAZE_B2_APPLICATION_KEY_ENV_NAMES) ||
    firstOptional(BACKBLAZE_B2_BUCKET_NAME_ENV_NAMES),
  );
}

function checkBackblazeB2Config() {
  const missing = [
    firstOptional(BACKBLAZE_B2_KEY_ID_ENV_NAMES)
      ? null
      : 'BACKBLAZE_B2_KEY_ID or B2_KEY_ID',
    firstOptional(BACKBLAZE_B2_APPLICATION_KEY_ENV_NAMES)
      ? null
      : 'BACKBLAZE_B2_APPLICATION_KEY, BACKBLAZE_B2_APP_KEY, or B2_APP_KEY',
    firstOptional(BACKBLAZE_B2_BUCKET_NAME_ENV_NAMES)
      ? null
      : 'BACKBLAZE_B2_BUCKET_NAME or B2_BUCKET_NAME',
  ].filter(Boolean);

  if (missing.length > 0) {
    fail(`backblaze-b2 requires ${missing.join('; ')}.`);
  }
}

function checkRequiredGroup(provider, names) {
  const missing = names.filter((name) => !optional(name));

  if (missing.length > 0) {
    fail(`${provider} requires ${missing.join(', ')}.`);
  }
}

function detectStorageProvider() {
  return 'supabase-storage';
}

function pass(message) {
  checks.push({ ok: true, message });
}

function fail(message) {
  checks.push({ ok: false, message });
}

function checkDeployButtons() {
  let ok = true;
  const homePage = readRequiredFile('app/page.tsx');
  const readme = readRequiredFile('README.md');
  const digitalOcean = readRequiredFile('.do/deploy.template.yaml');
  const netlify = readRequiredFile('netlify.toml');
  const render = readRequiredFile('render.yaml');
  const vercel = JSON.parse(readRequiredFile('vercel.json'));
  const expectedVercelButton = `[![Deploy with Vercel](https://vercel.com/button)](${SHERIN_VERCEL_DEPLOY_URL})`;
  const expectedDigitalOceanButton = `[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](${SHERIN_DIGITALOCEAN_DEPLOY_URL})`;
  const expectedNetlifyButton = `[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](${SHERIN_NETLIFY_DEPLOY_URL})`;
  const expectedRailwayButton = `[![Deploy on Railway](https://railway.com/button.svg)](${SHERIN_RAILWAY_DEPLOY_URL})`;
  const expectedRenderButton = `[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](${SHERIN_RENDER_DEPLOY_URL})`;
  const expectedNetlifyHomeLink = 'This site is powered by Netlify';

  if (!readme.includes(expectedVercelButton)) {
    ok = false;
    fail(
      'README Vercel deploy button must clone babysea-community/sherin-for-qwen.',
    );
  }

  if (!readme.includes(expectedDigitalOceanButton)) {
    ok = false;
    fail(
      'README DigitalOcean deploy button must clone babysea-community/sherin-for-qwen from main.',
    );
  }

  if (!readme.includes(expectedNetlifyButton)) {
    ok = false;
    fail(
      'README Netlify deploy button must clone babysea-community/sherin-for-qwen.',
    );
  }

  if (!readme.includes(expectedRailwayButton)) {
    ok = false;
    fail(
      'README Railway deploy button must use the published Sherin template.',
    );
  }

  if (!readme.includes(expectedRenderButton)) {
    ok = false;
    fail(
      'README Render deploy button must clone babysea-community/sherin-for-qwen.',
    );
  }

  if (
    !readme.includes('### Railway') ||
    !readme.includes(
      'Use the Deploy on Railway button above to start from the published Sherin template',
    )
  ) {
    ok = false;
    fail('README Railway deployment guidance is missing.');
  }

  for (const [heading, description] of [
    ['### DigitalOcean', 'DigitalOcean App Platform service'],
  ]) {
    if (!readme.includes(heading) || !readme.includes(description)) {
      ok = false;
      fail(`${heading.replace('### ', '')} deployment guidance is missing.`);
    }
  }

  if (vercel.framework !== 'nextjs') {
    ok = false;
    fail('vercel.json framework must be nextjs.');
  }

  if (!netlify.includes('[template.environment]')) {
    ok = false;
    fail('netlify.toml must include template environment prompts.');
  }

  for (const expected of [
    'runtime: node',
    'autoDeploy: false',
    'buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build',
    'startCommand: pnpm start -- -p $PORT',
  ]) {
    if (!render.includes(expected)) {
      ok = false;
      fail(`render.yaml must include ${expected}.`);
    }
  }

  for (const expected of [
    'spec:',
    'name: sherin',
    'environment_slug: node-js',
    'repo_clone_url: https://github.com/babysea-community/sherin-for-qwen.git',
    'build_command: corepack enable && pnpm install --frozen-lockfile && pnpm build',
    'run_command: pnpm start -- -p $PORT',
  ]) {
    if (!digitalOcean.includes(expected)) {
      ok = false;
      fail(`.do/deploy.template.yaml must include ${expected}.`);
    }
  }

  for (const name of SHERIN_NETLIFY_TEMPLATE_ENV) {
    if (!netlify.includes(`${name} =`)) {
      ok = false;
      fail(`netlify.toml template environment must include ${name}.`);
    }

    if (!render.includes(`key: ${name}`)) {
      ok = false;
      fail(`render.yaml environment must include ${name}.`);
    }

    if (!digitalOcean.includes(`key: ${name}`)) {
      ok = false;
      fail(`.do/deploy.template.yaml environment must include ${name}.`);
    }
  }

  if (ok) {
    pass(
      'DigitalOcean, Netlify, Railway, Render, and Vercel deploy buttons, deployment guidance, and the homepage backlink are wired.',
    );
  }
}

async function probeStorage() {
  const provider = preferredStorage ?? detectStorageProvider();
  const key = `sherin-doctor/${Date.now()}-${randomUUID()}.txt`;
  const payload = new TextEncoder().encode('sherin storage smoke test');

  if (provider === 'supabase-storage') {
    await probeSupabaseStorage(key, payload, 'Supabase Storage');
    return;
  }

  if (provider === 'aws-s3') {
    let endpointConfig;

    try {
      endpointConfig = awsS3EndpointConfig();
    } catch (error) {
      fail(
        error instanceof Error ? error.message : 'AWS S3 endpoint is invalid.',
      );
      return;
    }

    if (!endpointConfig) {
      fail('AWS S3 smoke test requires AWS_S3_ENDPOINT_URL.');
      return;
    }

    await probeS3CompatibleStorage(
      {
        accessKeyId: optional('AWS_S3_ACCESS_KEY_ID'),
        bucket: optional('AWS_S3_BUCKET_NAME'),
        endpoint: endpointConfig.clientEndpoint,
        forcePathStyle: endpointConfig.forcePathStyle,
        label: 'AWS S3',
        publicBaseUrl: endpointConfig.publicBaseUrl,
        region: optional('AWS_S3_REGION'),
        secretAccessKey: optional('AWS_S3_SECRET_ACCESS_KEY'),
      },
      key,
      payload,
    );
  } else if (provider === 'backblaze-b2') {
    await probeBackblazeB2Storage(key, payload);
  } else if (provider === 'cloudflare-r2') {
    await probeS3CompatibleStorage(
      {
        accessKeyId: optional('CLOUDFLARE_R2_ACCESS_KEY_ID'),
        bucket: optional('CLOUDFLARE_R2_BUCKET_NAME'),
        endpoint: cloudflareR2S3Endpoint(),
        forcePathStyle: true,
        label: 'Cloudflare R2',
        publicBaseUrl: optional('CLOUDFLARE_R2_CUSTOM_DOMAIN_URL'),
        region: 'auto',
        secretAccessKey: optional('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
      },
      key,
      payload,
    );
  } else if (provider === 'vercel-blob') {
    await probeVercelBlobStorage(key, payload);
  }

  await probeSupabaseStorage(
    `${key}.fallback`,
    payload,
    'Supabase Storage fallback',
  );
}

async function probeBackblazeB2Storage(key, payload) {
  const keyId = firstOptional(BACKBLAZE_B2_KEY_ID_ENV_NAMES);
  const applicationKey = firstOptional(BACKBLAZE_B2_APPLICATION_KEY_ENV_NAMES);
  const bucketName = firstOptional(BACKBLAZE_B2_BUCKET_NAME_ENV_NAMES);

  if (!keyId || !applicationKey || !bucketName) {
    fail(
      'Backblaze B2 smoke test requires BACKBLAZE_B2_KEY_ID/B2_KEY_ID, BACKBLAZE_B2_APPLICATION_KEY/B2_APP_KEY, and BACKBLAZE_B2_BUCKET_NAME/B2_BUCKET_NAME.',
    );
    return;
  }

  let authorization;
  let bucket;
  let uploadedFileName = null;

  try {
    authorization = await authorizeBackblazeAccount(keyId, applicationKey);
    bucket = await resolveBackblazeBucket(authorization, bucketName);
    const upload = await backblazeApi(authorization, 'b2_get_upload_url', {
      bucketId: bucket.bucketId,
    });
    const fileName = key.replace(/^\/+/, '');
    const uploadResponse = await fetch(upload.uploadUrl, {
      body: Buffer.from(payload),
      headers: {
        Authorization: upload.authorizationToken,
        'Content-Length': String(payload.byteLength),
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Bz-Content-Sha1': sha1Hex(payload),
        'X-Bz-File-Name': encodeB2Path(fileName),
      },
      method: 'POST',
    });
    const uploaded = await readBackblazeJson(uploadResponse, 'b2_upload_file');
    uploadedFileName = uploaded.fileName || fileName;
    const downloadAuth = await backblazeApi(
      authorization,
      'b2_get_download_authorization',
      {
        bucketId: bucket.bucketId,
        fileNamePrefix: uploadedFileName,
        validDurationInSeconds: 3600,
      },
    );
    const downloadUrl = `${authorization.downloadUrl}/file/${encodeURIComponent(bucketName)}/${encodeB2Path(uploadedFileName)}?Authorization=${encodeURIComponent(downloadAuth.authorizationToken)}`;
    const downloadResponse = await fetch(downloadUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });

    if (!downloadResponse.ok) {
      throw new Error(`download returned HTTP ${downloadResponse.status}`);
    }

    await assertDownloadedPayload(
      'Backblaze B2 smoke test',
      await downloadResponse.blob(),
      payload,
    );
    await deleteBackblazeFileVersions(
      authorization,
      bucket.bucketId,
      uploadedFileName,
    );
    uploadedFileName = null;
    pass('Backblaze B2 Put/Get/Delete smoke test passed.');
  } catch {
    fail('Backblaze B2 smoke test failed; inspect provider logs for details.');

    if (authorization && bucket && uploadedFileName) {
      try {
        await deleteBackblazeFileVersions(
          authorization,
          bucket.bucketId,
          uploadedFileName,
        );
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}

async function authorizeBackblazeAccount(keyId, applicationKey) {
  const response = await fetch(
    'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString('base64')}`,
      },
    },
  );

  return normalizeBackblazeAuthorization(
    await readBackblazeJson(response, 'b2_authorize_account'),
  );
}

function normalizeBackblazeAuthorization(response) {
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

async function resolveBackblazeBucket(authorization, bucketName) {
  const explicitBucketId = firstOptional([
    'BACKBLAZE_B2_BUCKET_ID',
    'B2_BUCKET_ID',
  ]);

  if (explicitBucketId) {
    return { bucketId: explicitBucketId, bucketName };
  }

  if (
    authorization.allowed?.bucketName === bucketName &&
    authorization.allowed.bucketId
  ) {
    return {
      bucketId: authorization.allowed.bucketId,
      bucketName,
    };
  }

  const response = await backblazeApi(authorization, 'b2_list_buckets', {
    accountId: authorization.accountId,
    bucketName,
  });
  const bucket = response.buckets?.find(
    (candidate) => candidate.bucketName === bucketName,
  );

  if (!bucket) {
    throw new Error('Backblaze B2 bucket not found.');
  }

  return bucket;
}

async function deleteBackblazeFileVersions(authorization, bucketId, fileName) {
  let nextFileName = fileName;
  let nextFileId;

  while (nextFileName) {
    const response = await backblazeApi(
      authorization,
      'b2_list_file_versions',
      {
        bucketId,
        maxFileCount: 100,
        prefix: fileName,
        startFileId: nextFileId,
        startFileName: nextFileName,
      },
    );
    const files = response.files ?? [];

    for (const file of files) {
      if (file.fileName !== fileName) {
        continue;
      }

      await backblazeApi(authorization, 'b2_delete_file_version', {
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

async function backblazeApi(authorization, operation, body) {
  const response = await fetch(
    `${authorization.apiUrl}/b2api/v3/${operation}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: authorization.authorizationToken,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  );

  return readBackblazeJson(response, operation);
}

async function readBackblazeJson(response, operation) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Backblaze B2 ${operation} failed (${response.status}): ${text || response.statusText}`,
    );
  }

  return text ? JSON.parse(text) : {};
}

function encodeB2Path(fileName) {
  return fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sha1Hex(data) {
  return createHash('sha1').update(data).digest('hex');
}

async function probeSupabaseStorage(key, payload, label) {
  const supabaseUrl = optional('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = optional('SUPABASE_SECRET_KEY');
  const bucket = optional('SUPABASE_STORAGE_BUCKET') ?? 'sherin-generations';
  let uploaded = false;

  if (!supabaseUrl || !serviceKey) {
    fail(
      `${label} smoke test requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.`,
    );
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const storage = supabase.storage.from(bucket);
    const { error: uploadError } = await storage.upload(key, payload, {
      contentType: 'text/plain; charset=utf-8',
      upsert: true,
    });

    if (uploadError) throw uploadError;

    uploaded = true;

    const { data: downloaded, error: downloadError } =
      await storage.download(key);

    if (downloadError) throw downloadError;

    await assertDownloadedPayload(`${label} smoke test`, downloaded, payload);

    const { error: removeError } = await storage.remove([key]);

    if (removeError) throw removeError;

    uploaded = false;

    pass(`${label} Put/Get/Delete smoke test passed.`);
  } catch {
    fail(`${label} smoke test failed; inspect provider logs for details.`);

    if (uploaded) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
        });
        await supabase.storage.from(bucket).remove([key]);
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}

async function probeVercelBlobStorage(key, payload) {
  const token = optional('BLOB_READ_WRITE_TOKEN');

  if (!token) {
    fail('Vercel Blob smoke test requires BLOB_READ_WRITE_TOKEN.');
    return;
  }

  let uploadedUrl = null;

  try {
    const blob = await import('@vercel/blob');
    const result = await blob.put(key, payload, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'text/plain; charset=utf-8',
      token,
    });
    uploadedUrl = result.url;

    const response = await fetch(uploadedUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`download returned HTTP ${response.status}`);
    }

    await assertDownloadedPayload(
      'Vercel Blob smoke test',
      await response.blob(),
      payload,
    );

    await blob.del(uploadedUrl, { token });
    uploadedUrl = null;
    pass('Vercel Blob Put/Get/Delete smoke test passed.');
  } catch {
    fail('Vercel Blob smoke test failed; inspect provider logs for details.');

    if (uploadedUrl) {
      try {
        const blob = await import('@vercel/blob');
        await blob.del(uploadedUrl, { token });
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}

async function probeS3CompatibleStorage(config, key, payload) {
  if (
    !config.region ||
    !config.endpoint ||
    !config.accessKeyId ||
    !config.secretAccessKey ||
    !config.bucket
  ) {
    fail(`${config.label} smoke test is missing required storage env values.`);
    return;
  }

  let client;
  let commands;

  try {
    commands = await import('@aws-sdk/client-s3');
    client = new commands.S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  } catch {
    fail(`${config.label} smoke test could not load @aws-sdk/client-s3.`);
    return;
  }

  try {
    await client.send(
      new commands.PutObjectCommand({
        Body: payload,
        Bucket: config.bucket,
        ContentType: 'text/plain; charset=utf-8',
        Key: key,
      }),
    );

    const object = await client.send(
      new commands.GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );

    await assertDownloadedPayload(
      `${config.label} smoke test`,
      object.Body,
      payload,
    );

    if (config.publicBaseUrl) {
      await assertPublicObjectPayload(config, key, payload);
    }

    await client.send(
      new commands.DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );

    const checks = config.publicBaseUrl
      ? 'Put/Get/Public read/Delete'
      : 'Put/Get/Delete';

    pass(`${config.label} ${checks} smoke test passed.`);
  } catch {
    fail(
      `${config.label} smoke test failed; inspect provider logs for details.`,
    );

    try {
      await client.send(
        new commands.DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
      );
    } catch {
      // Best effort cleanup only.
    }
  }
}

async function assertPublicObjectPayload(config, key, payload) {
  const publicUrl = buildPublicObjectUrl(config.publicBaseUrl, key);
  const response = await fetch(publicUrl, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `${config.label} public read returned HTTP ${response.status}.`,
    );
  }

  await assertDownloadedPayload(
    `${config.label} public-read smoke test`,
    await response.blob(),
    payload,
  );
}

function buildPublicObjectUrl(baseUrl, key) {
  const base = baseUrl.replace(/\/+$/, '');
  const safeKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${base}/${safeKey}`;
}

function cloudflareR2S3Endpoint() {
  const endpoint = optional('CLOUDFLARE_R2_ENDPOINT_URL');

  if (!endpoint) {
    return undefined;
  }

  try {
    const url = new URL(endpoint);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return endpoint;
  }
}

function awsS3EndpointConfig() {
  const endpointUrl = optional('AWS_S3_ENDPOINT_URL');
  const bucket = optional('AWS_S3_BUCKET_NAME');
  const region = optional('AWS_S3_REGION');

  if (!endpointUrl || !bucket || !region) {
    return undefined;
  }

  return resolveAwsS3EndpointConfig({ bucket, endpointUrl, region });
}

function checkAwsS3EndpointUrl(name) {
  const endpointUrl = optional(name);
  const bucket = optional('AWS_S3_BUCKET_NAME');
  const region = optional('AWS_S3_REGION');

  if (!endpointUrl) {
    return;
  }

  if (!bucket || !region) {
    fail(`${name} requires AWS_S3_BUCKET_NAME and AWS_S3_REGION to validate.`);
    return;
  }

  try {
    const config = resolveAwsS3EndpointConfig({ bucket, endpointUrl, region });

    pass(`${name} write endpoint is valid.`);
    pass(`${name} public image endpoint is valid.`);
  } catch {
    fail(`${name} endpoint configuration is invalid.`);
  }
}

function resolveAwsS3EndpointConfig({ bucket, endpointUrl, region }) {
  let url;

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
    const endpointBucket = bucketFromAwsEndpointPath(url.pathname);
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

function awsS3BucketHostSuffix(hostname, bucket) {
  const normalizedBucket = bucket.toLowerCase();

  if (!hostname.startsWith(`${normalizedBucket}.`)) {
    return null;
  }

  const suffix = hostname.slice(normalizedBucket.length + 1);

  return isAwsS3ServiceHost(suffix) ? suffix : null;
}

function isAwsS3ServiceHost(hostname) {
  return (
    hostname === 's3.amazonaws.com' ||
    /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(hostname)
  );
}

function regionalAwsS3ServiceHost(region) {
  return `s3.${region}.amazonaws.com`;
}

function bucketFromAwsEndpointPath(pathname) {
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

async function assertDownloadedPayload(label, body, expected) {
  const actual = await bodyToUint8Array(body);

  if (actual.byteLength !== expected.byteLength) {
    throw new Error(
      `${label} downloaded ${actual.byteLength} bytes, expected ${expected.byteLength}.`,
    );
  }

  for (let index = 0; index < expected.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} downloaded payload did not match upload.`);
    }
  }
}

async function bodyToUint8Array(body) {
  if (!body) {
    throw new Error('download returned an empty body.');
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (typeof body.transformToByteArray === 'function') {
    return new Uint8Array(await body.transformToByteArray());
  }

  if (typeof body.arrayBuffer === 'function') {
    return new Uint8Array(await body.arrayBuffer());
  }

  const chunks = [];

  for await (const chunk of body) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}
