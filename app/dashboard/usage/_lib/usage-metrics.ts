import { getGenerationMetadataString } from '@/lib/generation/display';
import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
} from '@/lib/app-config';

const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_STORAGE_PROVIDER = 'supabase-storage';
const FALLBACK_SAVE_HEALTH_WEIGHT = 0.75;

export type UsageGenerationRow = {
  created_at: string;
  hasAsset: boolean;
  inference_provider: string;
  metadata: Parameters<typeof getGenerationMetadataString>[0];
  model: string;
  output_format: string;
  ratio: string;
  status: string;
  storage_provider: string;
};

export type UsageMetrics = ReturnType<typeof createUsageMetrics>;

export function createUsageMetrics(
  rows: UsageGenerationRow[],
  activeStorageProvider: string | null,
  now = Date.now(),
) {
  const createdRows = rows.filter(isCreatedOutput);
  const unavailableRows = rows.filter(isUnavailableOutput);
  const failedRows = rows.filter((row) => row.status === 'failed');
  const activeRows = rows.filter((row) => isActiveStatus(row.status));
  const completedAttempts =
    createdRows.length + unavailableRows.length + failedRows.length;
  const totalAttempts = rows.length;
  const primaryStorageProvider =
    activeStorageProvider ?? FALLBACK_STORAGE_PROVIDER;
  const fallbackRows = createdRows.filter(isFallbackStorageSave);
  const primaryStorageSaves = Math.max(
    createdRows.length - fallbackRows.length,
    0,
  );
  const storageAttempts = createdRows.length + unavailableRows.length;
  const storageHealthScore =
    storageAttempts > 0
      ? percent(
          primaryStorageSaves +
            fallbackRows.length * FALLBACK_SAVE_HEALTH_WEIGHT,
          storageAttempts,
        )
      : null;

  return {
    creative: {
      favoriteFormat: mostUsedLabel(
        createdRows,
        (row) => formatOutputFormat(row.output_format),
        'No outputs yet',
      ),
      favoriteModel: mostUsedLabel(
        createdRows,
        (row) => row.model,
        'No outputs yet',
      ),
      favoriteRatio: mostUsedLabel(
        createdRows,
        (row) => row.ratio,
        'No outputs yet',
      ),
      last30DaysCreated: createdRows.filter((row) => isWithinDays(row, 30, now))
        .length,
      last7DaysCreated: createdRows.filter((row) => isWithinDays(row, 7, now))
        .length,
    },
    hasActiveGeneration: rows.some((row) => isActiveStatus(row.status)),
    header: {
      lastAttemptAt: rows[0]?.created_at ?? null,
    },
    outputs: {
      active: activeRows.length,
      completedAttempts,
      created: createdRows.length,
      createdRate: percent(createdRows.length, completedAttempts),
      failed: failedRows.length,
      failedRate: percent(failedRows.length, completedAttempts),
      totalAttempts,
      unavailable: unavailableRows.length,
      unavailableRate: percent(unavailableRows.length, completedAttempts),
    },
    providerMix: entriesSorted(
      countBy(createdRows, (row) =>
        formatInferenceProvider(row.inference_provider),
      ),
    ).map(([label, value]) => ({
      label,
      share: percent(value, createdRows.length),
      value,
    })),
    storage: {
      fallbackCount: fallbackRows.length,
      fallbackTargets: [formatStorageProvider(FALLBACK_STORAGE_PROVIDER)],
      healthScore: storageHealthScore,
      primaryProvider: primaryStorageProvider
        ? formatStorageProvider(primaryStorageProvider)
        : 'No storage yet',
      storedOutputs: createdRows.length,
      unavailable: unavailableRows.length,
    },
  };
}

export function isActiveStatus(status: string) {
  return status === 'queued' || status === 'running';
}

function isCreatedOutput(row: UsageGenerationRow) {
  return row.status === 'succeeded' && row.hasAsset;
}

function isUnavailableOutput(row: UsageGenerationRow) {
  return (
    row.status === 'unavailable' ||
    (row.status === 'succeeded' && !row.hasAsset)
  );
}

function isWithinDays(row: UsageGenerationRow, days: number, now: number) {
  return Date.parse(row.created_at) >= now - days * DAY_MS;
}

function fallbackStorageProviderForRow(row: UsageGenerationRow) {
  return getGenerationMetadataString(
    row.metadata,
    'sherin_storage_fallback_from',
  );
}

function isFallbackStorageSave(row: UsageGenerationRow) {
  const fallbackFrom = fallbackStorageProviderForRow(row);
  const fallbackReason = getGenerationMetadataString(
    row.metadata,
    'sherin_storage_fallback_reason',
  );

  return Boolean(fallbackFrom || fallbackReason);
}

function mostUsedLabel(
  rows: UsageGenerationRow[],
  pick: (row: UsageGenerationRow) => string,
  emptyLabel: string,
) {
  const [label, value] = entriesSorted(countBy(rows, pick))[0] ?? [
    emptyLabel,
    0,
  ];

  return { label, value };
}

function countBy<T>(items: T[], pick: (item: T) => string) {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = pick(item);

    if (!key) {
      continue;
    }

    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function entriesSorted(record: Record<string, number>) {
  return Object.entries(record).sort(([, first], [, second]) => second - first);
}

function percent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatInferenceProvider(provider: string) {
  if (provider === 'babysea') {
    return 'BabySea';
  }

  if (provider === BYOK_INFERENCE_PROVIDER_ID) {
    return BYOK_INFERENCE_PROVIDER_LABEL;
  }

  return provider;
}

function formatStorageProvider(provider: string) {
  if (provider === 'aws-s3') {
    return 'AWS S3';
  }

  if (provider === 'backblaze-b2') {
    return 'Backblaze B2';
  }

  if (provider === 'cloudflare-r2') {
    return 'Cloudflare R2';
  }

  if (provider === 'supabase-storage') {
    return 'Supabase Storage';
  }

  if (provider === 'vercel-blob') {
    return 'Vercel Blob';
  }

  return provider;
}

function formatOutputFormat(format: string) {
  return format ? format.toUpperCase() : 'No outputs yet';
}
