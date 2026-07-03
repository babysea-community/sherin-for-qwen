import type { Metadata } from 'next';
import {
  Activity,
  Bot,
  CalendarDays,
  CalendarRange,
  Cpu,
  HardDrive,
  Image,
  ImageMinus,
  ImageOff,
  Library,
} from 'lucide-react';

import { getStorageProviderStatus } from '@/lib/storage';
import { resolveAssetUrl } from '@/lib/storage/asset-url';
import { getUser } from '@/lib/database/server-actions';
import { getGenerationRequestSnapshot } from '@/lib/generation/display';
import { InlineAlibabaCloud } from '@/components/icons/inline-inference';
import {
  InlineHappyHorseLight,
  InlineQwen,
  InlineWan,
  InlineZImage,
} from '@/components/icons/inline-model';
import {
  InlineAwsS3,
  InlineBackblazeB2,
  InlineCloudflareR2,
  InlineSupabaseStorage,
  InlineVercelBlob,
} from '@/components/icons/inline-storage';
import { formatDate } from '@/lib/utils';

import { GenerationQueueKicker } from '../_components/generation-queue-kicker';
import { createUsageMetrics, type UsageMetrics } from './_lib/usage-metrics';

export const metadata: Metadata = {
  title: 'Usage',
  description: 'Generation metrics for your private workspace.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ASSET_AVAILABILITY_CONCURRENCY = 6;

export default async function UsagePage() {
  const { supabase, user } = await getUser();
  const storageStatus = getStorageProviderStatus();
  const summaryStorageProvider =
    storageStatus.preferred ?? storageStatus.active ?? 'supabase-storage';

  const { data: generations, error: generationsError } = await supabase
    .from('generations')
    .select('status,inference_provider,storage_provider,metadata,created_at')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false });

  if (generationsError) {
    throw new Error('Unable to load usage metrics.');
  }

  const rows = await mapWithConcurrency(
    generations ?? [],
    ASSET_AVAILABILITY_CONCURRENCY,
    async (generation) => {
      const request = getGenerationRequestSnapshot(generation.metadata);

      return {
        ...generation,
        hasAsset:
          generation.status === 'succeeded'
            ? Boolean(await resolveAssetUrl(generation))
            : false,
        model: request.model,
        output_format: request.outputFormat,
        ratio: request.ratio,
      };
    },
  );
  const metrics = createUsageMetrics(rows, summaryStorageProvider);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6">
      <GenerationQueueKicker enabled={metrics.hasActiveGeneration} refresh />

      <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20fr)_minmax(0,80fr)]">
          <div className="flex min-w-0 items-center justify-center text-center">
            <p className="text-xl font-semibold uppercase tracking-[0.32em] text-fuchsia-100 sm:text-2xl">
              Usage
            </p>
          </div>

          <UsageSummaryCard lastAttempt={metrics.header.lastAttemptAt} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UsageKpiCard
          badge={`${formatPercent(metrics.outputs.createdRate)} saved`}
          description="Images saved and ready to reuse"
          icon={
            <MetricIcon tone="good">
              <Image className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="Ready images"
          tone="good"
          value={formatNumber(metrics.outputs.created)}
        />
        <UsageKpiCard
          badge={metrics.outputs.unavailable > 0 ? 'needs check' : 'all clear'}
          description="Finished runs without a saved file"
          icon={
            <MetricIcon tone="warn">
              <ImageMinus className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="Missing files"
          tone={metrics.outputs.unavailable > 0 ? 'warn' : 'good'}
          value={formatNumber(metrics.outputs.unavailable)}
        />
        <UsageKpiCard
          badge={
            metrics.outputs.failed > 0
              ? `${formatPercent(metrics.outputs.failedRate)} need retry`
              : 'all clear'
          }
          description="Needs retry or setup check"
          icon={
            <MetricIcon tone="danger">
              <ImageOff className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="Needs retry"
          tone={metrics.outputs.failed > 0 ? 'danger' : 'good'}
          value={formatNumber(metrics.outputs.failed)}
        />
        <UsageKpiCard
          badge={
            metrics.outputs.active > 0
              ? `${formatNumber(metrics.outputs.active)} in progress`
              : 'all time'
          }
          description="Every generation request"
          icon={
            <MetricIcon tone="neutral">
              <Library className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="All attempts"
          tone="neutral"
          value={formatNumber(metrics.outputs.totalAttempts)}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UsageKpiCard
          badge="7 days"
          description="Saved images from the last 7 days"
          icon={
            <MetricIcon tone="info">
              <CalendarDays className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="This week"
          tone="info"
          value={formatNumber(metrics.creative.last7DaysCreated)}
        />
        <UsageKpiCard
          badge="30 days"
          description="Saved images from the last 30 days"
          icon={
            <MetricIcon tone="info">
              <CalendarRange className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="This month"
          tone="info"
          value={formatNumber(metrics.creative.last30DaysCreated)}
        />
        <UsageKpiCard
          badge={formatImageCount(metrics.creative.favoriteModel.value)}
          className="md:col-span-2"
          description="Model used most for saved images"
          icon={
            <MetricIcon tone="neutral">
              <Bot className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          title="Favorite model"
          tone="neutral"
          value={
            <FavoriteModelValue model={metrics.creative.favoriteModel.label} />
          }
          valueKind="text"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <InsightCard
          icon={
            <MetricIcon tone="info">
              <HardDrive className="size-4" aria-hidden="true" />
            </MetricIcon>
          }
          meter={<StorageHealthMeter score={metrics.storage.healthScore} />}
          title="Storage health"
        >
          <InsightRow
            label="Primary"
            value={
              <StorageProviderValue
                provider={metrics.storage.primaryProvider}
              />
            }
          />
          <InsightRow
            label="Fallback"
            value={
              <StorageProviderList
                providers={metrics.storage.fallbackTargets}
              />
            }
          />
          <InsightRow
            label="Stored outputs"
            value={formatNumber(metrics.storage.storedOutputs)}
          />
          <InsightRow
            label="Fallback saves"
            value={formatNumber(metrics.storage.fallbackCount)}
          />
          <InsightRow
            label="Unavailable"
            value={formatNumber(metrics.storage.unavailable)}
          />
        </InsightCard>

        {metrics.providerMix.length > 1 ? (
          <ProviderMixCard providers={metrics.providerMix} />
        ) : null}
      </section>
    </main>
  );
}

function UsageSummaryCard({ lastAttempt }: { lastAttempt: string | null }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <UsageSummaryRow
        icon={<Activity className="size-4" aria-hidden="true" />}
        label="Last attempt"
        value={lastAttempt ? formatDate(lastAttempt) : 'No attempts yet'}
      />
    </div>
  );
}

function UsageSummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UsageSummaryIcon>{icon}</UsageSummaryIcon>
      <p className="min-w-0 text-sm leading-5 text-slate-300">
        <span className="font-medium text-slate-400">{label}:</span>{' '}
        <span className="font-medium text-slate-100">{value}</span>
      </p>
    </div>
  );
}

function UsageSummaryIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-fuchsia-200/15 bg-fuchsia-200/10 text-fuchsia-100">
      {children}
    </span>
  );
}

async function mapWithConcurrency<Input, Output>(
  items: Input[],
  concurrency: number,
  mapItem: (item: Input) => Promise<Output>,
) {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const item = items[currentIndex];

      if (item === undefined) {
        continue;
      }

      results[currentIndex] = await mapItem(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

type MetricTone = 'danger' | 'good' | 'info' | 'neutral' | 'warn';

function UsageKpiCard({
  badge,
  className,
  description,
  icon,
  title,
  tone,
  value,
  valueKind = 'number',
}: {
  badge: string;
  className?: string;
  description: string;
  icon: React.ReactNode;
  title: string;
  tone: MetricTone;
  value: React.ReactNode;
  valueKind?: 'number' | 'text';
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          <p className="text-sm font-medium text-slate-200">{title}</p>
        </div>
        <MetricBadge tone={tone}>{badge}</MetricBadge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      <p
        className={
          valueKind === 'text'
            ? 'mt-5 min-w-0 text-2xl font-semibold leading-tight text-white'
            : 'mt-5 text-3xl font-semibold text-white'
        }
      >
        {value}
      </p>
    </div>
  );
}

function FavoriteModelValue({ model }: { model: string }) {
  const Icon = modelVendorIcon(model);

  return (
    <span className="inline-flex w-full max-w-full min-w-0 items-center gap-3">
      {Icon ? <Icon className="size-5 shrink-0" aria-hidden="true" /> : null}
      <span className="block min-w-0 truncate">{model}</span>
    </span>
  );
}

function modelVendorIcon(modelId: string) {
  if (modelId.startsWith('happyhorse/')) {
    return InlineHappyHorseLight;
  }

  if (modelId.startsWith('qwen/')) {
    return InlineQwen;
  }

  if (modelId.startsWith('wan/')) {
    return InlineWan;
  }

  if (modelId.startsWith('z/')) {
    return InlineZImage;
  }

  return InlineAlibabaCloud;
}

function InsightCard({
  children,
  icon,
  meter,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  meter?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        {icon}
        <p className="text-sm font-medium text-slate-200">{title}</p>
      </div>
      {meter ? <div className="mt-4">{meter}</div> : null}
      <dl className="mt-4 space-y-2">{children}</dl>
    </div>
  );
}

function InsightRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm">
      <dt className="truncate text-slate-300">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right font-semibold text-white">
        {typeof value === 'string' ? (
          <span className="truncate">{value}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function StorageProviderList({ providers }: { providers: string[] }) {
  if (providers.length === 0) {
    return <span className="truncate">None</span>;
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-1">
      {providers.map((provider, index) => (
        <span key={provider} className="inline-flex min-w-0 items-center">
          <StorageProviderValue provider={provider} />
          {index < providers.length - 1 ? (
            <span className="text-slate-500">,</span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

function StorageProviderValue({ provider }: { provider: string }) {
  const normalizedProvider = normalizeStorageProvider(provider);
  const icon = storageProviderIcon(normalizedProvider);

  if (!icon) {
    return <span className="truncate">{provider}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center justify-end gap-1.5">
      {icon}
      <span className="truncate">{provider}</span>
    </span>
  );
}

function storageProviderIcon(provider: string | null) {
  if (provider === 'aws-s3') {
    return <InlineAwsS3 className="size-4 shrink-0" aria-hidden="true" />;
  }

  if (provider === 'backblaze-b2') {
    return <InlineBackblazeB2 className="size-4 shrink-0" aria-hidden="true" />;
  }

  if (provider === 'cloudflare-r2') {
    return (
      <InlineCloudflareR2 className="size-4 shrink-0" aria-hidden="true" />
    );
  }

  if (provider === 'supabase-storage') {
    return (
      <InlineSupabaseStorage className="size-4 shrink-0" aria-hidden="true" />
    );
  }

  if (provider === 'vercel-blob') {
    return <InlineVercelBlob className="size-4 shrink-0" aria-hidden="true" />;
  }

  return null;
}

function StorageHealthMeter({ score }: { score: number | null }) {
  const hasScore = typeof score === 'number';
  const safeScore = hasScore ? Math.min(Math.max(score, 0), 100) : 0;

  return (
    <div
      aria-label={
        hasScore
          ? `Storage health ${formatPercent(safeScore)}`
          : 'Storage status appears after generations'
      }
      role="img"
    >
      <div className="flex items-center justify-between gap-3 text-xs leading-5">
        <span className="min-w-0 truncate text-slate-300">
          {hasScore
            ? storageHealthStatusText(safeScore)
            : 'Storage status appears after generations'}
        </span>
        <span className="shrink-0 font-semibold text-slate-100">
          {hasScore ? formatPercent(safeScore) : 'Pending'}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/70">
        {hasScore ? (
          <div
            className={`h-full rounded-full ${storageHealthBarClass(safeScore)}`}
            style={{ width: `${safeScore}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function storageHealthStatusText(score: number) {
  if (score >= 90) {
    return 'Storage looks healthy';
  }

  if (score >= 70) {
    return 'Storage needs attention';
  }

  return 'Storage is degraded';
}

function storageHealthBarClass(score: number) {
  if (score >= 90) {
    return 'bg-emerald-300';
  }

  if (score >= 70) {
    return 'bg-amber-300';
  }

  return 'bg-rose-300';
}

function ProviderMixCard({
  providers,
}: {
  providers: UsageMetrics['providerMix'];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <MetricIcon tone="neutral">
          <Cpu className="size-4" aria-hidden="true" />
        </MetricIcon>
        <p className="text-sm font-medium text-slate-200">Provider mix</p>
      </div>

      <div className="mt-4 space-y-3">
        {providers.map((provider) => (
          <div key={provider.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-300">
                {provider.label}
              </span>
              <span className="shrink-0 font-semibold text-white">
                {formatNumber(provider.value)} · {formatPercent(provider.share)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/70">
              <div
                className="h-full rounded-full bg-fuchsia-200"
                style={{ width: `${Math.max(provider.share, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricIcon({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: MetricTone;
}) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${metricToneClass(tone)}`}
    >
      {children}
    </span>
  );
}

function MetricBadge({
  children,
  tone,
}: {
  children: string;
  tone: MetricTone;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-1 text-[0.68rem] font-medium leading-none ${metricToneClass(tone)}`}
    >
      {children}
    </span>
  );
}

function metricToneClass(tone: MetricTone) {
  if (tone === 'good') {
    return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
  }

  if (tone === 'warn') {
    return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
  }

  if (tone === 'danger') {
    return 'border-rose-300/20 bg-rose-300/10 text-rose-100';
  }

  if (tone === 'info') {
    return 'border-sky-300/20 bg-sky-300/10 text-sky-100';
  }

  return 'border-fuchsia-200/15 bg-fuchsia-200/10 text-fuchsia-100';
}

function formatNumber(value: number) {
  return value.toLocaleString('en-US');
}

function formatPercent(value: number) {
  if (value > 0 && value < 10) {
    return `${value.toFixed(1)}%`;
  }

  return `${Math.round(value)}%`;
}

function formatImageCount(value: number) {
  return `${formatNumber(value)} ${value === 1 ? 'image' : 'images'}`;
}

function normalizeStorageProvider(provider: string) {
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

  return null;
}
