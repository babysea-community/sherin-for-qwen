import type { Metadata } from 'next';
import {
  Library,
  Image,
  Cpu,
  HardDrive,
  ImageMinus,
  ImageOff,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  getGenerationMetadataString,
  getGenerationRequestSnapshot,
} from '@/lib/generation/display';
import { SHERIN_SAMPLE_RESULT } from '@/lib/generation/sample-result';
import { getInferenceProviderStatus } from '@/lib/inference';
import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
} from '@/lib/app-config';
import { getStorageProviderStatus } from '@/lib/storage';
import { getUser } from '@/lib/database/server-actions';
import { formatDate } from '@/lib/utils';
import { InlineBabySea } from '@/components/icons/inline-babysea';
import { InlineAlibabaCloud } from '@/components/icons/inline-inference';
import {
  InlineAwsS3,
  InlineBackblazeB2,
  InlineCloudflareR2,
  InlineSupabaseStorage,
  InlineVercelBlob,
} from '@/components/icons/inline-storage';

import {
  CopyPromptButton,
  GenerationIdText,
} from '../_components/copy-prompt-button';
import { GenerationQueueKicker } from '../_components/generation-queue-kicker';
import { GalleryPreviewPanel } from './_components/gallery-preview-panel';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Every media asset you have generated.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GalleryPage() {
  const { supabase, user } = await getUser();
  const inferenceStatus = getInferenceProviderStatus();
  const storageStatus = getStorageProviderStatus();
  const summaryInferenceProvider =
    inferenceStatus.preferred ?? inferenceStatus.active;
  const summaryStorageProvider =
    storageStatus.preferred ?? storageStatus.active;

  const { data: generations } = await supabase
    .from('generations')
    .select(
      'id,status,inference_provider,storage_provider,metadata,error,created_at',
    )
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (generations ?? []).map((generation) => {
    const request = getGenerationRequestSnapshot(generation.metadata);
    const previewUrl = previewUrlForGeneration(generation);
    const previewContentType =
      previewContentTypeForGeneration(generation) ??
      previewContentTypeForOutputFormat(request.outputFormat);
    const previewSource: 'storage' | null = previewUrl ? 'storage' : null;
    const storageProvider = storageProviderForGeneration(generation);
    const fallbackStorageProvider =
      fallbackStorageProviderForGeneration(generation);
    const fallbackStorageReason =
      fallbackStorageReasonForGeneration(generation);

    return {
      ...generation,
      model: request.model,
      outputFormat: request.outputFormat,
      prompt: request.prompt,
      ratio: request.ratio,
      imageInfo: imageInfoForGeneration(
        previewSource,
        generation.inference_provider,
        storageProvider,
        generation.status,
        fallbackStorageProvider,
        fallbackStorageReason,
      ),
      fallbackStorageProvider,
      previewContentType,
      previewUrl,
      storageProvider,
      previewSource,
    };
  });
  const summary = createGallerySummary(rows, {
    inferenceProvider: summaryInferenceProvider,
    storageProvider: summaryStorageProvider,
  });
  const hasActiveGeneration = rows.some((row) => isActiveStatus(row.status));
  const displayRows = rows.length > 0 ? rows : [createSampleGalleryRow()];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6">
      <GenerationQueueKicker enabled={hasActiveGeneration} refresh />

      <Card className="rounded-3xl p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20fr)_minmax(0,35fr)_minmax(0,45fr)]">
          <div className="flex min-w-0 items-center justify-center text-center">
            <p className="text-xl font-semibold uppercase tracking-[0.32em] text-fuchsia-100 sm:text-2xl">
              Gallery
            </p>
          </div>

          <StatsSummaryCard summary={summary} />

          <ProviderSummaryCard
            inferenceLabel={summary.inferenceLabel}
            inferenceProviders={summary.inferenceProviders}
            storageProviders={summary.storageProviders}
          />
        </div>
      </Card>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayRows.map((generation, index) => (
          <Card
            key={generation.id}
            className="flex h-full flex-col rounded-3xl"
          >
            <CardHeader className="p-4 pb-0">
              <div className="min-w-0">
                <GenerationIdText generationId={generation.id} />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 text-xs leading-5 text-slate-400">
                    {formatDate(generation.created_at)}
                  </p>
                  <CopyPromptButton prompt={generation.prompt} />
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col p-4 pt-3">
              <p className="line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-slate-200">
                {generation.prompt}
              </p>

              <GalleryPreviewPanel
                priority={index < 4}
                prompt={generation.prompt}
                previewContentType={generation.previewContentType}
                previewUrl={generation.previewUrl}
                ratio={generation.ratio}
                status={generation.status}
              />
            </CardContent>

            <CardFooter className="mt-auto border-t border-white/10 p-4 pt-4">
              <p className="text-[0.68rem] leading-4 text-slate-500">
                {generation.imageInfo}
              </p>
            </CardFooter>
          </Card>
        ))}
      </div>
    </main>
  );
}

function createSampleGalleryRow() {
  return {
    created_at: SHERIN_SAMPLE_RESULT.createdAt,
    id: SHERIN_SAMPLE_RESULT.id,
    imageInfo:
      'Sample image only. Your first real generation will replace this card.',
    previewContentType: null,
    previewUrl: SHERIN_SAMPLE_RESULT.previewUrl,
    prompt: SHERIN_SAMPLE_RESULT.prompt,
    ratio: SHERIN_SAMPLE_RESULT.ratio,
    status: SHERIN_SAMPLE_RESULT.status,
  };
}

function StatsSummaryCard({
  summary,
}: {
  summary: ReturnType<typeof createGallerySummary>;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <SummaryMetricRow
        icon={<Image className="size-4" aria-hidden="true" />}
        label="Success"
        value={summary.success}
      />
      <SummaryMetricRow
        icon={<ImageOff className="size-4" aria-hidden="true" />}
        label="Failed"
        value={summary.failed}
      />
      <SummaryMetricRow
        icon={<ImageMinus className="size-4" aria-hidden="true" />}
        label="Unavailable"
        value={summary.unavailable}
      />
      <SummaryMetricRow
        icon={<Library className="size-4" aria-hidden="true" />}
        label="Total"
        value={summary.total}
      />
    </div>
  );
}

function SummaryMetricRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <SummaryIcon>{icon}</SummaryIcon>
      <p className="min-w-0 text-sm leading-5 text-slate-300">
        <span className="font-medium text-slate-400">{label}:</span>{' '}
        <span className="font-mono text-slate-100">{value}</span>
      </p>
    </div>
  );
}

function ProviderSummaryCard({
  inferenceLabel,
  inferenceProviders,
  storageProviders,
}: {
  inferenceLabel: string;
  inferenceProviders: string[];
  storageProviders: string[];
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <ProviderSummaryRow
        icon={<Cpu className="size-4" aria-hidden="true" />}
        label={inferenceLabel}
        values={inferenceProviders.map(inferenceProviderSummaryValue)}
      />
      <ProviderSummaryRow
        icon={<HardDrive className="size-4" aria-hidden="true" />}
        label="Storage"
        values={storageProviders.map(storageProviderSummaryValue)}
      />
    </div>
  );
}

type ProviderSummaryValue = {
  content: React.ReactNode;
  key: string;
};

function ProviderSummaryRow({
  icon,
  label,
  values,
}: {
  icon: React.ReactNode;
  label: string;
  values: ProviderSummaryValue[];
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <SummaryIcon>{icon}</SummaryIcon>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-sm leading-5 text-slate-300">
        <span className="font-medium text-slate-400">{label}:</span>{' '}
        {values.length > 0 ? (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 font-medium text-slate-100">
            {values.map((value, index) => (
              <span
                key={value.key}
                className="inline-flex min-w-0 items-center"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {value.content}
                </span>
                {index < values.length - 1 ? (
                  <span className="text-slate-500">,</span>
                ) : null}
              </span>
            ))}
          </span>
        ) : (
          <span className="font-medium text-slate-100">Not configured</span>
        )}
      </div>
    </div>
  );
}

function textSummaryValue(value: string): ProviderSummaryValue {
  return {
    content: value,
    key: value,
  };
}

function inferenceProviderSummaryValue(provider: string): ProviderSummaryValue {
  if (provider === 'babysea') {
    return {
      content: (
        <>
          <InlineBabySea className="size-4 shrink-0" aria-hidden="true" />
          <span>BabySea</span>
        </>
      ),
      key: provider,
    };
  }

  if (provider === BYOK_INFERENCE_PROVIDER_ID) {
    return {
      content: (
        <>
          <InlineAlibabaCloud
            className="h-3.5 w-5 shrink-0"
            aria-hidden="true"
          />
          <span>{BYOK_INFERENCE_PROVIDER_LABEL}</span>
        </>
      ),
      key: provider,
    };
  }

  return textSummaryValue(formatInferenceProvider(provider));
}

function storageProviderSummaryValue(provider: string): ProviderSummaryValue {
  const normalizedProvider = normalizeStorageProviderForSummary(provider);
  const fallbackSuffix = provider.toLowerCase().includes('fallback')
    ? ' (fallback)'
    : '';

  if (normalizedProvider === 'aws-s3') {
    return {
      content: (
        <>
          <InlineAwsS3 className="size-4 shrink-0" aria-hidden="true" />
          <span>AWS S3{fallbackSuffix}</span>
        </>
      ),
      key: provider,
    };
  }

  if (normalizedProvider === 'backblaze-b2') {
    return {
      content: (
        <>
          <InlineBackblazeB2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Backblaze B2{fallbackSuffix}</span>
        </>
      ),
      key: provider,
    };
  }

  if (normalizedProvider === 'cloudflare-r2') {
    return {
      content: (
        <>
          <InlineCloudflareR2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Cloudflare R2{fallbackSuffix}</span>
        </>
      ),
      key: provider,
    };
  }

  if (normalizedProvider === 'supabase-storage') {
    return {
      content: (
        <>
          <InlineSupabaseStorage
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span>Supabase Storage{fallbackSuffix}</span>
        </>
      ),
      key: provider,
    };
  }

  if (normalizedProvider === 'vercel-blob') {
    return {
      content: (
        <>
          <InlineVercelBlob className="size-4 shrink-0" aria-hidden="true" />
          <span>Vercel Blob{fallbackSuffix}</span>
        </>
      ),
      key: provider,
    };
  }

  return textSummaryValue(provider);
}

function SummaryIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-fuchsia-200/15 bg-fuchsia-200/10 text-fuchsia-100">
      {children}
    </span>
  );
}

function createGallerySummary(
  rows: Array<{
    status: string;
    previewSource: 'storage' | null;
  }>,
  providers: {
    inferenceProvider: string | null;
    storageProvider: string | null;
  },
) {
  return {
    failed: rows.filter((row) => row.status === 'failed').length,
    inferenceLabel:
      providers.inferenceProvider === 'babysea'
        ? 'Inference Execution'
        : 'Inference',
    inferenceProviders: providers.inferenceProvider
      ? [providers.inferenceProvider]
      : [],
    storageProviders: storageSummaryValues(providers.storageProvider),
    success: rows.filter(
      (row) => row.status === 'succeeded' && row.previewSource === 'storage',
    ).length,
    total: rows.length,
    unavailable: rows.filter(
      (row) =>
        row.status === 'unavailable' ||
        (row.status === 'succeeded' && row.previewSource !== 'storage'),
    ).length,
  };
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

function storageSummaryValues(activeStorageProvider: string | null) {
  const provider = normalizeStorageProviderForSummary(activeStorageProvider);

  if (!provider || provider === 'supabase-storage') {
    return ['Supabase Storage'];
  }

  return [formatStorageProvider(provider), 'Supabase Storage (fallback)'];
}

function normalizeStorageProviderForSummary(provider: string | null) {
  if (!provider) {
    return null;
  }

  const normalizedProvider = provider
    .trim()
    .toLowerCase()
    .replace(/\s*\(fallback\)\s*$/, '');

  if (normalizedProvider === 'aws-s3' || normalizedProvider === 'aws s3') {
    return 'aws-s3';
  }

  if (
    normalizedProvider === 'backblaze-b2' ||
    normalizedProvider === 'backblaze b2'
  ) {
    return 'backblaze-b2';
  }

  if (
    normalizedProvider === 'cloudflare-r2' ||
    normalizedProvider === 'cloudflare r2'
  ) {
    return 'cloudflare-r2';
  }

  if (
    normalizedProvider === 'supabase-storage' ||
    normalizedProvider === 'supabase storage'
  ) {
    return 'supabase-storage';
  }

  if (
    normalizedProvider === 'vercel-blob' ||
    normalizedProvider === 'vercel blob'
  ) {
    return 'vercel-blob';
  }

  return normalizedProvider;
}

function isActiveStatus(status: string) {
  return status === 'queued' || status === 'running';
}

function storageProviderForGeneration(generation: {
  id: string;
  metadata: Parameters<typeof getGenerationMetadataString>[0];
  storage_provider: string;
}) {
  const metadataStorageProvider = getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_provider',
  );

  if (metadataStorageProvider) {
    return metadataStorageProvider;
  }

  return generation.storage_provider;
}

function previewUrlForGeneration(generation: {
  id: string;
  metadata: Parameters<typeof getGenerationMetadataString>[0];
}) {
  const publicUrl = getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_public_url',
  );

  if (publicUrl) {
    return publicUrl;
  }

  const storagePath = getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_path',
  );

  if (!storagePath) {
    return null;
  }

  return `/dashboard/gallery/preview/${generation.id}`;
}

function previewContentTypeForGeneration(generation: {
  metadata: Parameters<typeof getGenerationMetadataString>[0];
}) {
  return getGenerationMetadataString(
    generation.metadata,
    'sherin_asset_content_type',
  );
}

function previewContentTypeForOutputFormat(outputFormat: string | undefined) {
  return outputFormat === 'mp4' ? 'video/mp4' : null;
}

function fallbackStorageProviderForGeneration(generation: {
  metadata: Parameters<typeof getGenerationMetadataString>[0];
}) {
  return getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_fallback_from',
  );
}

function fallbackStorageReasonForGeneration(generation: {
  metadata: Parameters<typeof getGenerationMetadataString>[0];
}) {
  return getGenerationMetadataString(
    generation.metadata,
    'sherin_storage_fallback_reason',
  );
}

function imageInfoForGeneration(
  previewSource: 'storage' | null,
  inferenceProvider: string,
  storageProvider: string,
  status: string,
  fallbackStorageProvider: string | null,
  fallbackStorageReason: string | null,
) {
  if (previewSource === 'storage') {
    if (
      fallbackStorageProvider &&
      fallbackStorageProvider !== storageProvider
    ) {
      return (
        <>
          Your <CodeValue>{storageProvider}</CodeValue> works as fallback, but
          your <CodeValue>{fallbackStorageProvider}</CodeValue> is not set up
          correctly.
          {fallbackStorageReason ? (
            <>
              {' '}
              Reason: <CodeValue>{fallbackStorageReason}</CodeValue>
            </>
          ) : null}
        </>
      );
    }

    return (
      <>
        Your <CodeValue>{storageProvider}</CodeValue> is set up correctly and
        the generated media is ready to view. Good job!
      </>
    );
  }

  if (status === 'failed') {
    return (
      <>
        Your generation failed. Check your{' '}
        <CodeValue>{inferenceProvider}</CodeValue> logs and configuration.
      </>
    );
  }

  if (status === 'unavailable' || status === 'succeeded') {
    return (
      <>
        Your media file is not available. Check your{' '}
        <CodeValue>{storageProvider}</CodeValue> content.
      </>
    );
  }

  return 'Media output is not available yet.';
}

function CodeValue({ children }: { children: string }) {
  return (
    <code className="rounded-md border border-white/10 bg-white/[0.04] px-1 py-0.5 font-mono text-[0.68rem] text-slate-200">
      {children}
    </code>
  );
}
