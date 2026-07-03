import { z, type ZodTypeAny } from 'zod';

export function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(name: string) {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Validate the value of `name` against a Zod schema. Throws a single, friendly
 * error that includes the variable name. Use for any env that is more than a
 * non-empty string (emails, enums, integers, JSON, etc.).
 */
export function requireEnvSchema<TSchema extends ZodTypeAny>(
  name: string,
  schema: TSchema,
): z.infer<TSchema> {
  const raw = requireEnv(name);
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join('; ');

    throw new Error(`Invalid environment variable ${name}: ${reason}`);
  }

  return parsed.data;
}

export function getOptionalEnvSchema<TSchema extends ZodTypeAny>(
  name: string,
  schema: TSchema,
): z.infer<TSchema> | undefined {
  const raw = getOptionalEnv(name);

  if (raw === undefined) {
    return undefined;
  }

  return requireEnvSchema(name, schema);
}

const EMAIL_SCHEMA = z.email('must be a valid email address');

export function requireEmailEnv(name: string) {
  return requireEnvSchema(name, EMAIL_SCHEMA);
}

const POSITIVE_INT_SCHEMA = z
  .string()
  .regex(/^[1-9][0-9]*$/, 'must be a positive integer');

export function getOptionalPositiveIntEnv(name: string) {
  const raw = getOptionalEnvSchema(name, POSITIVE_INT_SCHEMA);

  return raw === undefined ? undefined : Number.parseInt(raw, 10);
}

type UrlEnvOptions = {
  allowLocalhost?: boolean;
  allowedHosts?: ReadonlySet<string>;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function requireUrlEnv(name: string, options: UrlEnvOptions = {}) {
  return normalizeUrl(name, requireEnv(name), options);
}

export function getOptionalUrlEnv(name: string, options: UrlEnvOptions = {}) {
  const value = getOptionalEnv(name);

  return value ? normalizeUrl(name, value, options) : undefined;
}

export function getSiteUrl() {
  return normalizeUrl(
    'NEXT_PUBLIC_SITE_URL',
    getOptionalEnv('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3011',
    { allowLocalhost: true },
  );
}

export function getSupabaseUrl() {
  return requireUrlEnv('NEXT_PUBLIC_SUPABASE_URL', {
    allowLocalhost: true,
  });
}

function normalizeUrl(name: string, value: string, options: UrlEnvOptions) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }

  const isLocalhost = LOCAL_HOSTNAMES.has(url.hostname.toLowerCase());

  if (isLocalhost && isHostedRuntime()) {
    throw new Error(`${name} cannot use localhost in hosted deployments`);
  }

  if (url.protocol !== 'https:' && !(options.allowLocalhost && isLocalhost)) {
    throw new Error(`${name} must use HTTPS outside local development`);
  }

  if (
    options.allowedHosts &&
    !options.allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error(`${name} host is not allowed`);
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}

function isHostedRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.NETLIFY === 'true' ||
    Boolean(process.env.NETLIFY)
  );
}
