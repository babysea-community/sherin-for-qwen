import type { Metadata } from 'next';
import { CircleStop } from 'lucide-react';
import {
  type ByokInferenceProviderId,
  getModelIdsForInferenceProvider,
  isSherinModelId,
  type SherinModelId,
} from '@/lib/app-config';
import { Button } from '@/components/ui/button';
import {
  getBabySeaStudioModelSchemas,
  type BabySeaStudioModelSchema,
} from '@/lib/inference/babysea/server-actions';
import {
  getGenerationMetadataString,
  getGenerationRequestSnapshot,
} from '@/lib/generation/display';
import { SHERIN_SAMPLE_RESULT } from '@/lib/generation/sample-result';
import { getInferenceProviderStatus } from '@/lib/inference';
import { resolveAssetUrl } from '@/lib/storage/asset-url';
import { getUser } from '@/lib/database/server-actions';
import { GenerationQueueKicker } from '../_components/generation-queue-kicker';
import { GenerateSubmitButton } from './_components/generate-submit-button';
import { StudioModelFields } from './_components/studio-model-fields';
import { StudioAutoRefresh } from './_components/studio-auto-refresh';
import { StudioResultPanel } from './_components/studio-result-panel';
import { StudioToasts, type StudioToast } from './_components/studio-toasts';
import { cancelActiveGeneration, generateImage } from './_lib/server-actions';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Generate media through your own keys and storage.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 180;

const INFERENCE_UNCONFIGURED_COPY =
  'Set a BabySea or BYOK provider API key before generating.';
const BABYSEA_SCHEMA_UNAVAILABLE_COPY =
  'BabySea model schema could not be loaded. Check the API key and region before generating.';

const STUDIO_TOASTS: Record<string, Omit<StudioToast, 'id'>> = {
  invalid_input: {
    type: 'warning',
    message:
      'Some generation settings or input media are invalid. Check the active model fields and use public HTTPS image or video URLs.',
  },
  inference_unconfigured: {
    type: 'warning',
    message: INFERENCE_UNCONFIGURED_COPY,
  },
  schema_unavailable: {
    type: 'warning',
    message: BABYSEA_SCHEMA_UNAVAILABLE_COPY,
  },
  input_upload_failed: {
    type: 'error',
    message:
      'Input image upload failed before generation started. Check your storage provider and try again.',
  },
  input_upload_invalid: {
    type: 'warning',
    message:
      'Upload PNG, JPEG, WebP, or GIF files under 10 MB and within the model limit.',
  },
  generation_failed: {
    type: 'error',
    message:
      'Generation did not finish. The result keeps the provider context and stored error.',
  },
  generation_cancelled: {
    type: 'warning',
    message:
      'Generation canceled. Provider-side jobs already running may still finish.',
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudioPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, user } = await getUser();

  const inferenceStatus = getInferenceProviderStatus();
  const activeProvider = inferenceStatus.active;
  const isBabySea = activeProvider === 'babysea';
  const babySeaSchemaResult = isBabySea
    ? await loadBabySeaSchemas().catch(() => {
        console.warn(
          'BabySea model schema unavailable. Generation is disabled until the API responds.',
        );

        return new Error('BabySea model schema unavailable.');
      })
    : null;
  const babySeaSchemas =
    babySeaSchemaResult instanceof Error ? null : babySeaSchemaResult;
  const babySeaSchemaUnavailable = babySeaSchemaResult instanceof Error;
  const hasBabySeaModels = babySeaSchemas
    ? Object.keys(babySeaSchemas).length > 0
    : false;
  const canGenerate =
    activeProvider !== null && (!isBabySea || hasBabySeaModels);

  const errorParam = typeof params.error === 'string' ? params.error : null;
  const successId = typeof params.created === 'string' ? params.created : null;

  const { data: latest } = await supabase
    .from('generations')
    .select(
      'id,status,inference_provider,storage_provider,metadata,error,created_at',
    )
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(1);

  const latestGeneration = latest?.[0] ?? null;
  const showSampleResult = latestGeneration === null;
  const latestRequest = latestGeneration
    ? getGenerationRequestSnapshot(latestGeneration.metadata)
    : null;
  const studioFormDefaults = latestGeneration
    ? readStudioFormDefaults(latestGeneration.metadata)
    : {};
  const latestGenerationActive = latestGeneration
    ? isActiveGenerationStatus(latestGeneration.status)
    : false;
  const latestActiveStage = latestGenerationActive
    ? readActiveStage(latestGeneration?.metadata)
    : null;
  const latestAssetUrl = latestGeneration
    ? await resolveAssetUrl(latestGeneration)
    : null;
  const latestPreviewUrl =
    latestAssetUrl ??
    (showSampleResult ? SHERIN_SAMPLE_RESULT.previewUrl : null);
  const latestPreviewContentType = latestGeneration
    ? (getGenerationMetadataString(
        latestGeneration.metadata,
        'sherin_asset_content_type',
      ) ?? previewContentTypeForOutputFormat(latestRequest?.outputFormat))
    : null;
  const showGeneratingPreview = latestGenerationActive && !latestPreviewUrl;
  const studioToasts = createStudioToasts({
    activeProvider,
    babySeaSchemaUnavailable,
    errorParam,
    successId,
  });

  return (
    <main className="mx-auto w-full max-w-7xl">
      <StudioAutoRefresh enabled={latestGenerationActive} />
      <GenerationQueueKicker enabled={latestGenerationActive} />
      <StudioToasts toasts={studioToasts} />

      <section className="grid gap-5 xl:grid-cols-[minmax(24rem,0.96fr)_minmax(0,1.04fr)]">
        <form
          action={canGenerate ? generateImage : undefined}
          className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/25 backdrop-blur"
        >
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                Input
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Media model
              </h1>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <StudioModelFields
              activeProvider={activeProvider}
              babySeaSchemas={babySeaSchemas ?? {}}
              initialModel={studioFormDefaults.model}
              initialPrompt={studioFormDefaults.prompt}
            />

            <div className="grid gap-2 pt-1">
              <GenerateSubmitButton
                disabled={!canGenerate}
                locked={latestGenerationActive}
              />

              {latestGenerationActive ? (
                <Button
                  formAction={cancelActiveGeneration}
                  formNoValidate
                  type="submit"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-2xl font-semibold"
                >
                  <CircleStop className="size-4" aria-hidden="true" />
                  Cancel your generation
                </Button>
              ) : null}
            </div>
          </div>
        </form>

        <section className="flex min-h-[42rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                  Output
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Latest result
                </h2>
              </div>
              {showSampleResult ? (
                <p className="shrink-0 whitespace-nowrap text-right text-xs leading-5 text-slate-500 sm:pt-8">
                  Sample image. Generate once to replace it.
                </p>
              ) : null}
            </div>
          </div>

          <StudioResultPanel
            error={
              latestGeneration?.error
                ? {
                    id: latestGeneration.id,
                    message: latestGeneration.error,
                    code: getGenerationMetadataString(
                      latestGeneration.metadata,
                      'sherin_error_code',
                    ),
                    statusCode: readStatusCode(
                      latestGeneration.metadata,
                      'sherin_error_status_code',
                    ),
                    provider: latestGeneration.inference_provider,
                  }
                : null
            }
            generation={
              latestGeneration
                ? {
                    createdAt: latestGeneration.created_at,
                    model: latestRequest?.model ?? 'Unknown model',
                    outputFormat: latestRequest?.outputFormat ?? 'unknown',
                    prompt: latestRequest?.prompt ?? 'Prompt unavailable',
                    ratio: latestRequest?.ratio ?? 'unknown',
                  }
                : showSampleResult
                  ? SHERIN_SAMPLE_RESULT
                  : null
            }
            generating={showGeneratingPreview}
            previewContentType={latestPreviewContentType}
            previewUrl={latestPreviewUrl}
            stage={latestActiveStage}
          />
        </section>
      </section>
    </main>
  );
}

function isActiveGenerationStatus(status: string) {
  return status === 'queued' || status === 'running';
}

function previewContentTypeForOutputFormat(outputFormat: string | undefined) {
  return outputFormat === 'mp4' ? 'video/mp4' : null;
}

function readStudioFormDefaults(metadata: unknown): {
  model?: SherinModelId;
  prompt?: string;
} {
  const record = toMetadataRecord(metadata);
  const job = toMetadataRecord(record?.sherin_job);
  const values = toMetadataRecord(job?.values);
  const prompt =
    getStringValue(record?.sherin_prompt) ?? getStringValue(values?.prompt);

  return {
    model:
      toSherinModelId(record?.sherin_model_id) ??
      toSherinModelId(values?.model),
    ...(prompt ? { prompt } : {}),
  };
}

// Surface the worker's current pipeline stage so the studio panel can show
// a live signal during long-running generations. The auto-refresh component
// re-runs this server component every 2.5s while a generation is active,
// so users see stage transitions in near real time without SSE/websockets.
function readActiveStage(metadata: unknown): string | null {
  return getStringValue(toMetadataRecord(metadata)?.sherin_stage);
}

function readStatusCode(metadata: unknown, key: string): number | null {
  const value = toMetadataRecord(metadata)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toMetadataRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toSherinModelId(value: unknown): SherinModelId | undefined {
  return isSherinModelId(value) ? value : undefined;
}

function createStudioToasts({
  activeProvider,
  babySeaSchemaUnavailable,
  errorParam,
  successId,
}: {
  activeProvider: 'babysea' | ByokInferenceProviderId | null;
  babySeaSchemaUnavailable: boolean;
  errorParam: string | null;
  successId: string | null;
}) {
  const toasts = new Map<string, StudioToast>();

  if (!activeProvider) {
    toasts.set('studio-inference-unconfigured', {
      id: 'studio-inference-unconfigured',
      type: 'warning',
      message: INFERENCE_UNCONFIGURED_COPY,
    });
  }

  if (babySeaSchemaUnavailable) {
    toasts.set('studio-schema-unavailable', {
      id: 'studio-schema-unavailable',
      type: 'warning',
      message: BABYSEA_SCHEMA_UNAVAILABLE_COPY,
    });
  }

  if (errorParam) {
    const toastConfig = STUDIO_TOASTS[errorParam];

    if (toastConfig) {
      toasts.set(`studio-${errorParam}`, {
        id: `studio-${errorParam}`,
        ...toastConfig,
      });
    }
  }

  if (successId) {
    toasts.set(`studio-created-${successId}`, {
      id: `studio-created-${successId}`,
      type: 'success',
      message: 'Generation started.',
    });
  }

  return [...toasts.values()];
}

async function loadBabySeaSchemas() {
  return getBabySeaStudioModelSchemas(
    getModelIdsForInferenceProvider('babysea'),
  ) as Promise<Partial<Record<SherinModelId, BabySeaStudioModelSchema>>>;
}
