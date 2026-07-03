import type { Json } from '../database.types';

export function getGenerationMetadataString(
  metadata: Json | null | undefined,
  key: string,
) {
  const record = toMetadataRecord(metadata);
  const value = record?.[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getGenerationRequestSnapshot(
  metadata: Json | null | undefined,
) {
  const record = toMetadataRecord(metadata);
  const job = toMetadataRecord(record?.sherin_job);
  const values = toMetadataRecord(job?.values);

  return {
    model:
      getStringValue(record?.sherin_model_id) ??
      getStringValue(values?.model) ??
      'Unknown model',
    outputFormat:
      getStringValue(record?.sherin_output_format) ??
      getStringValue(values?.output_format) ??
      'unknown',
    prompt:
      getStringValue(record?.sherin_prompt) ??
      getStringValue(values?.prompt) ??
      'Prompt unavailable',
    ratio:
      getStringValue(record?.sherin_ratio) ??
      getStringValue(values?.ratio) ??
      'unknown',
    resolution:
      getStringValue(record?.sherin_resolution) ??
      getStringValue(values?.generation_resolution) ??
      null,
  };
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
    case 'failed':
      return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
    case 'unavailable':
      return 'border-orange-300/30 bg-orange-300/10 text-orange-100';
    case 'running':
      return 'border-sky-300/30 bg-sky-300/10 text-sky-100';
    case 'queued':
      return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
    default:
      return 'border-white/10 bg-white/[0.03] text-slate-300';
  }
}

function toMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
