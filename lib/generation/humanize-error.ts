/**
 * Translate a stored `generations.error` row into copy a person can act on.
 *
 * Inputs come from the failed-generation row:
 *
 * - `message`: raw `generations.error` string. For direct BYOK providers this
 *   can include a provider HTTP error body. For BabySea the worker captures the
 *   SDK's `BabySeaError.message` directly, or
 *   for transport blips it captures `BabySeaRetryError.message` which looks
 *   like `"All 3 attempts failed. Last error: HTTP 502"`.
 * - `code`: `metadata.sherin_error_code` set by `classifyInferenceError`. Known
 *   values include `HTTP_<status>`, `babysea_error`, `network_error`,
 *   `timeout`, `generation_failed`, `unknown`.
 * - `statusCode`: `metadata.sherin_error_status_code` when the underlying
 *   failure had an HTTP response.
 * - `provider`: `generations.inference_provider`, used only to address the
 *   user with the same provider name they configured.
 *
 * The output is intentionally short: a title that names the failure class and
 * a description with the suggested next step. The raw `message` is rendered
 * separately by the caller as a collapsible technical detail.
 */
import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
} from '@/lib/app-config';

export type HumanizedGenerationError = {
  title: string;
  description: string;
};

export function humanizeGenerationError(input: {
  message: string;
  code?: string | null;
  statusCode?: number | null;
  provider?: string | null;
}): HumanizedGenerationError {
  const providerLabel = providerDisplayName(input.provider);
  const status = input.statusCode ?? parseStatusFromMessage(input.message);
  const detail = parseDetailFromMessage(input.message);
  const lowerMessage = input.message.toLowerCase();
  const code = input.code ?? '';

  if (
    status === 402 ||
    /insufficient[_ ]credits?/i.test(input.message) ||
    /out of credits/i.test(input.message)
  ) {
    return {
      title: `${providerLabel} is out of credits`,
      description: `Add credits in your ${providerLabel} dashboard, then try again. App only forwards the request; the credits are billed by ${providerLabel}.`,
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: `${providerLabel} rejected the API key`,
      description: `App's request was refused. Check that your ${providerLabel} API key is set, active, and authorized for this model, then try again.`,
    };
  }

  if (status === 404) {
    return {
      title: 'Model or resource not found',
      description: `${providerLabel} could not find the requested model. Pick a different model or confirm it is available in your ${providerLabel} account.`,
    };
  }

  if (status === 413 || status === 415) {
    return {
      title: 'Input rejected by the provider',
      description: `${providerLabel} could not accept your input (file too large or unsupported format). Try a smaller file or a supported format.`,
    };
  }

  if (status === 400 || status === 422) {
    return {
      title: 'Provider rejected the request parameters',
      description:
        detail ??
        `${providerLabel} returned a validation error. Adjust the prompt, ratio, or model-specific settings and try again.`,
    };
  }

  if (status === 429) {
    return {
      title: `${providerLabel} rate limit reached`,
      description: `Too many requests in a short window. Wait a moment and try again.`,
    };
  }

  if (code === 'generation_failed') {
    return {
      title: 'Provider reported the generation failed',
      description:
        detail ??
        `${providerLabel} accepted the request but could not produce an image. Try a different prompt or model.`,
    };
  }

  if (
    code === 'network_error' ||
    code === 'timeout' ||
    (status !== null && status >= 500) ||
    /all \d+ attempts failed/i.test(lowerMessage) ||
    /http 5\d\d/i.test(lowerMessage)
  ) {
    return {
      title: `${providerLabel} had a temporary problem`,
      description: `App retried automatically but ${providerLabel} kept failing. Please try again in a moment.`,
    };
  }

  if (/cancel/i.test(lowerMessage)) {
    return {
      title: 'Generation canceled',
      description: 'You canceled this generation.',
    };
  }

  return {
    title: 'Generation failed',
    description:
      detail ??
      `App could not complete this request with ${providerLabel}. See the technical details below.`,
  };
}

function providerDisplayName(provider: string | null | undefined): string {
  if (provider === BYOK_INFERENCE_PROVIDER_ID) {
    return BYOK_INFERENCE_PROVIDER_LABEL;
  }
  if (provider === 'babysea') return 'BabySea';
  return 'the inference provider';
}

function parseStatusFromMessage(message: string): number | null {
  const paren = message.match(/\((\d{3})\)/);
  if (paren) return Number(paren[1]);
  // BabySea retry wrapper: "Last error: HTTP 502"
  const http = message.match(/HTTP\s+(\d{3})/i);
  if (http) return Number(http[1]);
  return null;
}

function parseDetailFromMessage(message: string): string | null {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) return null;

  const jsonSlice = message.slice(jsonStart);
  try {
    const parsed: unknown = JSON.parse(jsonSlice);
    if (parsed && typeof parsed === 'object') {
      const detail = (parsed as Record<string, unknown>).detail;
      if (typeof detail === 'string' && detail.length > 0) {
        return detail;
      }
      const error = (parsed as Record<string, unknown>).error;
      if (typeof error === 'string' && error.length > 0) {
        return error;
      }
    }
  } catch {
    // not JSON, fall through
  }
  return null;
}
