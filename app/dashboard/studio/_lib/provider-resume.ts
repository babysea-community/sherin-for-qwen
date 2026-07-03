import 'server-only';

import { BYOK_INFERENCE_PROVIDER_ID } from '@/lib/app-config';
import type { Database, Json } from '@/lib/database.types';
import { BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE } from '@/lib/inference/errors';

type GenerationRow = Database['public']['Tables']['generations']['Row'];
type ProviderResumeRow = Pick<
  GenerationRow,
  'created_at' | 'inference_provider' | 'metadata' | 'provider_generation_id'
>;

const MAX_BYOK_POLL_RESUME_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_BABYSEA_RESUME_AGE_MS = 2 * 60 * 60 * 1000;

export function canResumeProviderWorkload(generation: ProviderResumeRow) {
  return (
    canResumeByokProviderPolling(generation) ||
    canResumeBabySeaGenerationPolling(generation) ||
    canResumeBabySeaIdempotency(generation)
  );
}

export function canResumeByokProviderPolling(generation: ProviderResumeRow) {
  return (
    generation.inference_provider === BYOK_INFERENCE_PROVIDER_ID &&
    hasProviderGenerationId(generation) &&
    isWithinResumeWindow(generation, MAX_BYOK_POLL_RESUME_AGE_MS)
  );
}

export function canResumeBabySeaGenerationPolling(
  generation: ProviderResumeRow,
) {
  return (
    generation.inference_provider === 'babysea' &&
    hasProviderGenerationId(generation) &&
    isWithinResumeWindow(generation, MAX_BABYSEA_RESUME_AGE_MS)
  );
}

export function canResumeBabySeaIdempotency(generation: ProviderResumeRow) {
  const metadata = toMetadataRecord(generation.metadata);

  return (
    generation.inference_provider === 'babysea' &&
    metadata?.sherin_last_transient_error_code ===
      BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE &&
    isWithinResumeWindow(generation, MAX_BABYSEA_RESUME_AGE_MS)
  );
}

export function hasProviderGenerationId(
  generation: Pick<GenerationRow, 'provider_generation_id'>,
) {
  return (
    typeof generation.provider_generation_id === 'string' &&
    generation.provider_generation_id.length > 0
  );
}

export function isWithinBabySeaResumeWindow(
  generation: Pick<GenerationRow, 'created_at'>,
) {
  return isWithinResumeWindow(generation, MAX_BABYSEA_RESUME_AGE_MS);
}

function isWithinResumeWindow(
  generation: Pick<GenerationRow, 'created_at'>,
  maxAgeMs: number,
) {
  const createdAtMs = Date.parse(generation.created_at);

  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs < maxAgeMs;
}

function toMetadataRecord(metadata: Json | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}
