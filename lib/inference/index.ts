import 'server-only';

import { BYOK_INFERENCE_PROVIDER_ID } from '@/lib/app-config';
import { getOptionalEnv } from '@/lib/utils/env';
import type { InferenceProvider, InferenceProviderId } from './types';
import {
  createBabySeaProvider,
  isBabySeaConfigured,
} from './babysea/server-actions';
import { createByokProvider, isByokProviderConfigured } from './byok-provider';

export type { InferenceProvider, InferenceProviderId } from './types';
export type { InferenceCancelResult } from './types';
export type { InferenceRequest, InferenceResult } from './types';

/**
 * Resolve the active inference provider. App auto-detects which provider
 * is configured. If both are present, INFERENCE_PROVIDER decides; otherwise
 * Inference takes precedence because it is app's default stack.
 */
export function resolveInferenceProvider(): InferenceProvider {
  const configuredPreference = getOptionalEnv('INFERENCE_PROVIDER');
  const preferred = normalizePreference(configuredPreference);
  const babyseaReady = isBabySeaConfigured();
  const byokReady = isByokProviderConfigured();

  if (configuredPreference && !preferred) {
    throw new Error(
      `INFERENCE_PROVIDER must be ${BYOK_INFERENCE_PROVIDER_ID} or babysea.`,
    );
  }

  if (preferred === 'babysea') {
    if (!babyseaReady) {
      throw new Error(
        'INFERENCE_PROVIDER=babysea but BABYSEA_API_KEY is not set.',
      );
    }
    return createBabySeaProvider();
  }

  if (preferred === BYOK_INFERENCE_PROVIDER_ID) {
    if (!byokReady) {
      throw new Error(
        `INFERENCE_PROVIDER=${BYOK_INFERENCE_PROVIDER_ID} but the direct provider API key is not set.`,
      );
    }
    return createByokProvider();
  }

  if (byokReady) {
    return createByokProvider();
  }

  if (babyseaReady) {
    return createBabySeaProvider();
  }

  throw new Error(
    'No inference provider configured. Set the direct provider API key or BABYSEA_API_KEY.',
  );
}

export function resolveInferenceProviderById(
  providerId: InferenceProviderId,
): InferenceProvider {
  if (providerId === 'babysea') {
    if (!isBabySeaConfigured()) {
      throw new Error(
        'Queued generation requires BabySea, but BABYSEA_API_KEY is not set.',
      );
    }

    return createBabySeaProvider();
  }

  if (providerId === BYOK_INFERENCE_PROVIDER_ID) {
    if (!isByokProviderConfigured()) {
      throw new Error(
        'Queued generation requires the configured BYOK provider, but its API key is not set.',
      );
    }

    return createByokProvider();
  }

  throw new Error(`Unsupported queued inference provider: ${providerId}`);
}

export function getInferenceProviderStatus() {
  const preferred = normalizePreference(getOptionalEnv('INFERENCE_PROVIDER'));
  const byok = isByokProviderConfigured();
  const babysea = isBabySeaConfigured();
  const active: InferenceProviderId | null = (() => {
    try {
      return resolveInferenceProvider().id;
    } catch {
      return null;
    }
  })();

  return { preferred, byok, babysea, active };
}

function normalizePreference(
  value: string | undefined,
): InferenceProviderId | null {
  if (!value) {
    return null;
  }
  const lower = value.trim().toLowerCase();
  if (lower === BYOK_INFERENCE_PROVIDER_ID || lower === 'babysea') {
    return lower;
  }
  return null;
}
