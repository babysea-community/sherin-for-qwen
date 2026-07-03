#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_PLATFORM = 'other';
const DEFAULT_URL = 'https://sentry.io';
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const ENABLED_BOOLEAN_VALUES = new Set(['1', 'true', 'on', 'yes']);
const DISABLED_BOOLEAN_VALUES = new Set(['0', 'false', 'off', 'no']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const prefix = '[sentry-project-check]';
const RESERVED_PROJECT_SLUGS = new Set(['babysea']);
const sensitiveValues = new Set();

/**
 * @typedef {{ allowPermissionSkip: boolean; expectedPlatform: string; org: string; project: string; strictOwnership: boolean; token: string; url: string }} SentryConfig
 */

/**
 * @typedef {{ optionalStatuses?: number[]; method?: string }} SentryApiOptions
 */

/**
 * @typedef {Record<string, unknown>} UnknownRecord
 */

/** @param {unknown} value */
function rememberSensitive(value) {
  if (typeof value === 'string' && value.length > 1) {
    sensitiveValues.add(value);
  }
}

/** @returns {Record<string, string>} */
function readLocalConfig() {
  let contents = '';

  try {
    contents = readFileSync('.sentryclirc', 'utf8');
  } catch {
    return {};
  }

  /** @type {Record<string, Record<string, string>>} */
  const config = {};
  let section = '';

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);

    if (sectionMatch) {
      section = sectionMatch[1] ?? '';
      config[section] ??= {};
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1 || !section) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    (config[section] ??= {})[key] = value;
  }

  return config['defaults'] ?? {};
}

/** @returns {SentryConfig} */
function getConfig() {
  const defaults = readLocalConfig();
  const org =
    normalizeConfigValue(process.env.SENTRY_ORG) ??
    normalizeConfigValue(defaults.org);
  const project =
    normalizeConfigValue(process.env.SENTRY_PROJECT) ??
    normalizeConfigValue(defaults.project);
  const token = normalizeConfigValue(process.env.SENTRY_AUTH_TOKEN);
  const rawUrl =
    normalizeConfigValue(process.env.SENTRY_URL) ??
    normalizeConfigValue(defaults.url) ??
    DEFAULT_URL;
  const url = normalizeSentryUrl(rawUrl);
  const expectedPlatform =
    normalizeConfigValue(process.env.SENTRY_EXPECTED_PLATFORM) ??
    DEFAULT_PLATFORM;
  const allowPermissionSkip = isPermissionSkipEnabled(
    normalizeConfigValue(process.env.SENTRY_ALLOW_PERMISSION_SKIP),
  );
  const strictOwnership = isStrictOwnershipEnabled(
    normalizeConfigValue(process.env.SENTRY_STRICT_OWNERSHIP),
  );

  for (const value of [org, project, token, rawUrl, url]) {
    rememberSensitive(value);
  }

  if (!org) {
    throw new Error(
      'SENTRY_ORG is required as a repository secret or ignored local config.',
    );
  }

  if (!project) {
    throw new Error(
      'SENTRY_PROJECT is required as a repository secret or ignored local config.',
    );
  }

  if (RESERVED_PROJECT_SLUGS.has(project.toLowerCase())) {
    throw new Error('Refusing to check the reserved main Sentry project.');
  }

  if (!token) {
    throw new Error(
      'SENTRY_AUTH_TOKEN is required as a repository secret; do not commit it.',
    );
  }

  return {
    allowPermissionSkip,
    expectedPlatform,
    org,
    project,
    strictOwnership,
    token,
    url,
  };
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function normalizeConfigValue(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/** @param {string} value */
function stripTrailingSlashes(value) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

/** @param {string} value */
function normalizeSentryUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error('SENTRY_URL must be a valid URL.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocalhost = LOCAL_HOSTNAMES.has(hostname);

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('SENTRY_URL must use HTTPS unless it points to localhost.');
  }

  url.pathname = stripTrailingSlashes(url.pathname);
  url.search = '';
  url.hash = '';

  return stripTrailingSlashes(url.toString());
}

/** @param {string | undefined} value */
function isStrictOwnershipEnabled(value) {
  if (!value) {
    return true;
  }

  return !DISABLED_BOOLEAN_VALUES.has(value.toLowerCase());
}

/** @param {string | undefined} value */
function isPermissionSkipEnabled(value) {
  return value ? ENABLED_BOOLEAN_VALUES.has(value.toLowerCase()) : false;
}

/** @param {unknown} value */
function redact(value) {
  let redacted = String(value);
  const sortedSensitiveValues = [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  );

  for (const sensitiveValue of sortedSensitiveValues) {
    redacted = redacted.split(sensitiveValue).join('[redacted-sentry-config]');
  }

  return redacted
    .replace(/sntry[a-z0-9_]+/gi, '[redacted-sentry-token]')
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [redacted]')
    .slice(0, 700);
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {unknown} value
 * @returns {UnknownRecord | null}
 */
function asRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return /** @type {UnknownRecord} */ (value);
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function stringValue(value) {
  return typeof value === 'string' ? value : undefined;
}

/** @param {number} attempt */
async function sleepBeforeRetry(attempt) {
  await sleep(RETRY_BASE_DELAY_MS * attempt);
}

/**
 * @param {SentryConfig} config
 * @param {string} path
 * @param {SentryApiOptions} [options]
 * @returns {Promise<unknown>}
 */
async function sentryApi(config, path, options = {}) {
  const optionalStatuses = new Set(options.optionalStatuses ?? []);
  const method = normalizeConfigValue(options.method) ?? 'GET';
  const requestUrl = `${config.url}/api/0${path}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;

    try {
      response = await fetch(requestUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
        method,
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleepBeforeRetry(attempt);
        continue;
      }

      throw new Error(`Sentry API request failed: ${errorMessage(error)}`);
    }

    let text;

    try {
      text = await response.text();
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleepBeforeRetry(attempt);
        continue;
      }

      throw new Error(
        `Sentry API response body could not be read: ${errorMessage(error)}`,
      );
    }

    if (!response.ok) {
      if (optionalStatuses.has(response.status)) {
        console.warn(
          `${prefix} optional Sentry endpoint skipped; returned ${response.status}.`,
        );
        return undefined;
      }

      if (RETRY_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleepBeforeRetry(attempt);
        continue;
      }

      throw new Error(`Sentry API ${response.status}: ${redact(text)}`);
    }

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Sentry API returned invalid JSON: ${errorMessage(error)}`,
      );
    }
  }

  throw new Error('Sentry API retry budget exhausted.');
}

async function main() {
  const config = getConfig();
  const projectPath = `/projects/${encodeURIComponent(
    config.org,
  )}/${encodeURIComponent(config.project)}/`;
  /** @type {string[]} */
  const failures = [];

  console.log(`${prefix} checking configured Sentry project`);

  const projectResponse = await sentryApi(config, projectPath, {
    optionalStatuses: config.allowPermissionSkip ? [401, 403] : [],
  });

  if (projectResponse === undefined) {
    console.warn(
      `${prefix} skipped: Sentry API denied project read access. Grant the CI token read access to enforce this check.`,
    );
    return;
  }

  const project = asRecord(projectResponse);

  if (!project) {
    throw new Error('Sentry project response was not an object.');
  }

  const projectSlug = stringValue(project.slug);
  const organization = asRecord(project.organization);
  const organizationSlug = organization
    ? stringValue(organization.slug)
    : undefined;
  const projectStatus = stringValue(project.status);
  const projectPlatform = stringValue(project.platform);

  if (!projectSlug) {
    failures.push('Sentry project response did not include a project slug.');
  } else if (projectSlug !== config.project) {
    failures.push('configured project did not match the Sentry API response');
  }

  if (!organizationSlug) {
    failures.push(
      'Sentry project response did not include an organization slug.',
    );
  } else if (organizationSlug !== config.org) {
    failures.push(
      'configured organization did not match the Sentry API response',
    );
  }

  if (!projectStatus) {
    failures.push('Sentry project response did not include a project status.');
  } else if (projectStatus.toLowerCase() !== 'active') {
    failures.push('configured project is not active');
  }

  if (config.expectedPlatform) {
    if (!projectPlatform) {
      failures.push('Sentry project response did not include a platform.');
    } else if (projectPlatform !== config.expectedPlatform) {
      failures.push(
        'configured platform did not match the Sentry API response',
      );
    }
  }

  const ownershipResponse = await sentryApi(
    config,
    `${projectPath}ownership/`,
    {
      optionalStatuses:
        config.allowPermissionSkip || !config.strictOwnership ? [403, 404] : [],
    },
  );

  if (ownershipResponse !== undefined) {
    const ownership = asRecord(ownershipResponse);

    if (!ownership) {
      failures.push('Sentry ownership response was not an object.');
    } else {
      const rawOwnership = stringValue(ownership.raw) ?? '';

      if (!rawOwnership.trim()) {
        failures.push('Sentry ownership rules are empty.');
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Sentry project check failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(`${prefix} OK: configured Sentry project is active and guarded.`);
  console.log(
    `${prefix} Seer stays dashboard-managed; this repo ships no Sentry runtime SDK or DSN.`,
  );
}

main().catch((error) => {
  console.error(`${prefix} ${redact(errorMessage(error))}`);
  process.exitCode = 1;
});
