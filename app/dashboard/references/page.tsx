import type { Metadata } from 'next';
import {
  Binary,
  Cpu,
  Database,
  HardDrive,
  Images,
  LinkIcon,
  UploadCloud,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { getGenerationRequestSnapshot } from '@/lib/generation/display';
import { getInferenceProviderStatus } from '@/lib/inference';
import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
} from '@/lib/app-config';
import { getStorageProviderStatus, resolveStoredAssetUrl } from '@/lib/storage';
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
  CopyReferenceUrlButton,
  GenerationIdText,
} from '../_components/copy-prompt-button';
import { GenerationQueueKicker } from '../_components/generation-queue-kicker';
import { GalleryPreviewPanel } from '../gallery/_components/gallery-preview-panel';
import { readQueuedGenerationInputFileAssets } from '../studio/_lib/generation-job';

export const metadata: Metadata = {
  title: 'References',
  description: 'Every input image stored.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReferencesPage() {
  const { supabase, user } = await getUser();
  const inferenceStatus = getInferenceProviderStatus();
  const storageStatus = getStorageProviderStatus();
  const summaryInferenceProvider =
    inferenceStatus.preferred ?? inferenceStatus.active;
  const summaryStorageProvider =
    storageStatus.preferred ?? storageStatus.active;
  const { data: generations } = await supabase
    .from('generations')
    .select('id,status,storage_provider,metadata,created_at')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = await Promise.all(
    (generations ?? []).flatMap((generation) => {
      const request = getGenerationRequestSnapshot(generation.metadata);
      const inputAssets = readQueuedGenerationInputFileAssets(
        generation.metadata,
      );

      return inputAssets.map(async (asset, index) => {
        const previewUrl = previewUrlForReferenceAsset(
          generation.id,
          index,
          asset,
        );
        const resolvedUrl = await resolveReferenceDisplayUrl(asset);

        return {
          byteLength: asset.byteLength,
          copyUrlEndpoint: referenceCopyUrlEndpoint(generation.id, index),
          created_at: generation.created_at,
          displayUrl: resolvedUrl ?? previewUrl,
          generationId: generation.id,
          id: `${generation.id}:${index}`,
          model: request.model,
          previewUrl,
          prompt: request.prompt,
          ratio: request.ratio,
          source: asset.source,
          status: generation.status,
          storagePath: asset.storagePath,
          storageProvider: asset.storageProvider,
        };
      });
    }),
  );
  const summary = createReferencesSummary(rows);
  const providerSummary = createReferencesProviderSummary({
    inferenceProvider: summaryInferenceProvider,
    storageProvider: summaryStorageProvider,
  });
  const hasActiveGeneration = (generations ?? []).some((generation) =>
    isActiveStatus(generation.status),
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6">
      <GenerationQueueKicker enabled={hasActiveGeneration} refresh />

      <Card className="rounded-3xl p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20fr)_minmax(0,35fr)_minmax(0,45fr)]">
          <div className="flex min-w-0 items-center justify-center text-center">
            <p className="text-xl font-semibold uppercase tracking-[0.32em] text-fuchsia-100 sm:text-2xl">
              References
            </p>
          </div>

          <StatsSummaryCard summary={summary} />

          <ProviderSummaryCard
            inferenceLabel={providerSummary.inferenceLabel}
            inferenceProviders={providerSummary.inferenceProviders}
            storageProviders={providerSummary.storageProviders}
          />
        </div>
      </Card>

      {rows.length > 0 ? (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((reference, index) => (
            <Card
              key={reference.id}
              className="flex h-full flex-col rounded-3xl"
            >
              <CardHeader className="p-4 pb-0">
                <div className="min-w-0">
                  <GenerationIdText generationId={reference.generationId} />
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="min-w-0 text-xs leading-5 text-slate-400">
                      {formatDate(reference.created_at)}
                    </p>
                    <CopyReferenceUrlButton
                      urlEndpoint={reference.copyUrlEndpoint}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col p-4 pt-3">
                <p className="line-clamp-3 min-h-[3.75rem] break-all font-mono text-[0.68rem] leading-5 text-slate-200">
                  {reference.displayUrl}
                </p>

                <GalleryPreviewPanel
                  priority={index < 4}
                  prompt={reference.prompt}
                  previewUrl={reference.previewUrl}
                  ratio={reference.ratio}
                  status={reference.previewUrl ? 'succeeded' : reference.status}
                />
              </CardContent>

              <CardFooter className="mt-auto border-t border-white/10 p-4 pt-4">
                <p className="text-[0.68rem] leading-4 text-slate-500">
                  {referenceInfo(reference)}
                </p>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-3xl p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-fuchsia-100">
            <Images className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-200">
            No reference images yet.
          </p>
        </Card>
      )}
    </main>
  );
}

type ReferenceRow = {
  byteLength: number;
  copyUrlEndpoint: string;
  created_at: string;
  displayUrl: string;
  generationId: string;
  id: string;
  model: string;
  previewUrl: string | null;
  prompt: string;
  ratio: string;
  source: 'upload' | 'url';
  status: string;
  storagePath: string;
  storageProvider: string;
};

function StatsSummaryCard({
  summary,
}: {
  summary: ReturnType<typeof createReferencesSummary>;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <SummaryMetricRow
        icon={<Database className="size-4" aria-hidden="true" />}
        label="Stored"
        value={summary.total}
      />
      <SummaryMetricRow
        icon={<UploadCloud className="size-4" aria-hidden="true" />}
        label="Uploads"
        value={summary.uploads}
      />
      <SummaryMetricRow
        icon={<LinkIcon className="size-4" aria-hidden="true" />}
        label="URLs"
        value={summary.urls}
      />
      <SummaryMetricRow
        icon={<Binary className="size-4" aria-hidden="true" />}
        label="Bytes"
        value={formatBytes(summary.bytes)}
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
  value: number | string;
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

function previewUrlForReferenceAsset(
  generationId: string,
  index: number,
  asset: ReturnType<typeof readQueuedGenerationInputFileAssets>[number],
) {
  if (asset.publicUrl) {
    return asset.publicUrl;
  }

  return `/dashboard/references/preview/${generationId}/${index}`;
}

function referenceCopyUrlEndpoint(generationId: string, index: number) {
  return `/dashboard/references/preview/${generationId}/${index}?format=json`;
}

async function resolveReferenceDisplayUrl(
  asset: ReturnType<typeof readQueuedGenerationInputFileAssets>[number],
) {
  try {
    return await resolveStoredAssetUrl({
      publicUrl: asset.publicUrl,
      storagePath: asset.storagePath,
      storageProvider: asset.storageProvider,
    });
  } catch {
    return null;
  }
}

function createReferencesSummary(rows: ReferenceRow[]) {
  return {
    bytes: rows.reduce((total, row) => total + row.byteLength, 0),
    total: rows.length,
    uploads: rows.filter((row) => row.source === 'upload').length,
    urls: rows.filter((row) => row.source === 'url').length,
  };
}

function createReferencesProviderSummary(providers: {
  inferenceProvider: string | null;
  storageProvider: string | null;
}) {
  return {
    inferenceLabel:
      providers.inferenceProvider === 'babysea'
        ? 'Inference Execution'
        : 'Inference',
    inferenceProviders: providers.inferenceProvider
      ? [providers.inferenceProvider]
      : [],
    storageProviders: storageSummaryValues(providers.storageProvider),
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

function referenceInfo(reference: ReferenceRow) {
  if (reference.previewUrl) {
    return (
      <>
        Your <CodeValue>{reference.storageProvider}</CodeValue> is set up
        correctly and the reference image is ready to reuse. Good job!
      </>
    );
  }

  return (
    <>
      Your reference image is not available. Check your{' '}
      <CodeValue>{reference.storageProvider}</CodeValue> content.
    </>
  );
}

function CodeValue({ children }: { children: string }) {
  return (
    <code className="rounded-md border border-white/10 bg-white/[0.04] px-1 py-0.5 font-mono text-[0.68rem] text-slate-200">
      {children}
    </code>
  );
}

function isActiveStatus(status: string) {
  return status === 'queued' || status === 'running';
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${bytes} B`;
}
