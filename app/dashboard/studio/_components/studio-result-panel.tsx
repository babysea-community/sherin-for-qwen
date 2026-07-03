'use client';

import { useCallback, useEffect, useState } from 'react';
import { Image, Loader2, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { humanizeGenerationError } from '@/lib/generation/humanize-error';
import { CopyPromptButton } from '../../_components/copy-prompt-button';
import { ImageLoadingSkeleton } from '../../_components/image-loading-skeleton';

type StudioResultGeneration = {
  createdAt: string;
  model: string;
  outputFormat: string;
  prompt: string;
  ratio: string;
};

type StudioResultError = {
  id: string;
  message: string;
  code?: string | null;
  statusCode?: number | null;
  provider?: string | null;
};

export function StudioResultPanel({
  error,
  generation,
  generating,
  previewContentType,
  previewUrl,
  stage,
}: {
  error?: StudioResultError | null;
  generation: StudioResultGeneration | null;
  generating: boolean;
  previewContentType?: string | null;
  previewUrl: string | null;
  stage?: string | null;
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [unavailablePreviewUrl, setUnavailablePreviewUrl] = useState<
    string | null
  >(null);
  const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null);
  const previewIsVideo = previewContentType?.startsWith('video/') ?? false;

  useEffect(() => {
    setDismissedErrorId(null);
  }, [error?.id, error?.message]);

  const previewLoaded = Boolean(previewUrl && loadedPreviewUrl === previewUrl);
  const previewUnavailable = Boolean(
    previewUrl && unavailablePreviewUrl === previewUrl,
  );
  const showPreview = Boolean(previewUrl && !previewUnavailable);
  const showLoadingPreview = showPreview && !previewLoaded;
  const showGeneratingPreview = generating && !showPreview;
  const showError = Boolean(
    error &&
    !showPreview &&
    !showGeneratingPreview &&
    dismissedErrorId !== error.id,
  );
  const showDetails = Boolean(generation && previewLoaded);
  const handlePreviewImageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !previewUrl || !image.complete) {
        return;
      }

      if (image.naturalWidth > 0) {
        setLoadedPreviewUrl(previewUrl);
        setUnavailablePreviewUrl((currentPreviewUrl) =>
          currentPreviewUrl === previewUrl ? null : currentPreviewUrl,
        );
      } else {
        setLoadedPreviewUrl(null);
        setUnavailablePreviewUrl(previewUrl);
      }
    },
    [previewUrl],
  );

  return (
    <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="relative flex aspect-square w-full flex-none overflow-hidden rounded-xl border border-white/10 bg-slate-950">
        {showPreview && previewUrl && previewIsVideo ? (
          <div
            aria-busy={showLoadingPreview}
            className="relative block size-full"
          >
            {showLoadingPreview ? <ImageLoadingSkeleton /> : null}
            <video
              src={previewUrl}
              aria-label="Generated video"
              className={`absolute inset-0 size-full object-cover transition duration-500 ${
                previewLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              controls
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={() => {
                setLoadedPreviewUrl(previewUrl);
                setUnavailablePreviewUrl((currentPreviewUrl) =>
                  currentPreviewUrl === previewUrl ? null : currentPreviewUrl,
                );
              }}
              onError={() => {
                setLoadedPreviewUrl(null);
                setUnavailablePreviewUrl(previewUrl);
              }}
            />
          </div>
        ) : showPreview && previewUrl ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open generated image"
            aria-busy={showLoadingPreview}
            className="group relative block size-full"
          >
            {showLoadingPreview ? <ImageLoadingSkeleton /> : null}
            <img
              ref={handlePreviewImageRef}
              src={previewUrl}
              alt={
                generation?.prompt
                  ? `Generated image for: ${generation.prompt}`
                  : 'Generated image'
              }
              className={`absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.02] ${
                previewLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              decoding="async"
              fetchPriority="high"
              loading="eager"
              onLoad={() => {
                setLoadedPreviewUrl(previewUrl);
                setUnavailablePreviewUrl((currentPreviewUrl) =>
                  currentPreviewUrl === previewUrl ? null : currentPreviewUrl,
                );
              }}
              onError={() => {
                setLoadedPreviewUrl(null);
                setUnavailablePreviewUrl(previewUrl);
              }}
              sizes="(min-width: 1280px) 50vw, 100vw"
            />
          </a>
        ) : showGeneratingPreview ? (
          <GeneratingPreview stage={stage ?? null} />
        ) : (
          <BlankPreview />
        )}
      </div>

      {showError && error ? (
        <GenerationErrorBanner
          rawMessage={error.message}
          code={error.code ?? null}
          statusCode={error.statusCode ?? null}
          provider={error.provider ?? null}
          onDismiss={() => setDismissedErrorId(error.id)}
        />
      ) : null}

      {showDetails && generation ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="line-clamp-2 text-xs leading-5 text-slate-200">
              {generation.prompt}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-slate-500">
                {formatDate(generation.createdAt)}
              </p>
              <CopyPromptButton prompt={generation.prompt} />
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-xs">
            <ResultFact label="Model" value={generation.model} />
            <ResultFact label="Ratio" value={generation.ratio} />
            <ResultFact label="Format" value={generation.outputFormat} />
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function GenerationErrorBanner({
  rawMessage,
  code,
  statusCode,
  provider,
  onDismiss,
}: {
  rawMessage: string;
  code: string | null;
  statusCode: number | null;
  provider: string | null;
  onDismiss: () => void;
}) {
  const { title, description } = humanizeGenerationError({
    message: rawMessage,
    code,
    statusCode,
    provider,
  });
  const showRawDetails = rawMessage.trim() !== description.trim();

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm shadow-lg shadow-rose-950/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-rose-100">{title}</p>
          <p className="mt-1 break-words text-xs leading-5 text-rose-100/80">
            {description}
          </p>
          {showRawDetails ? (
            <details className="mt-2 text-xs text-rose-100/60">
              <summary className="cursor-pointer select-none text-rose-100/70 hover:text-rose-50">
                Technical details
              </summary>
              <p className="mt-1 break-words font-mono text-[11px] leading-5 text-rose-100/70">
                {rawMessage}
              </p>
            </details>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close error message"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-rose-100/70 transition hover:bg-white/10 hover:text-rose-50"
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function BlankPreview() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
          <Image className="size-6 animate-pulse" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-200">No output yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Your result will appear here
        </p>
      </div>
    </div>
  );
}

function GeneratingPreview({ stage }: { stage: string | null }) {
  const stageLabel = humanizeStage(stage);
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.18),transparent_34rem)] opacity-80 motion-safe:animate-pulse" />
      <div className="absolute inset-x-10 top-1/3 h-px bg-gradient-to-r from-transparent via-fuchsia-200/30 to-transparent motion-safe:animate-pulse" />

      <div className="relative">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-fuchsia-200/20 bg-fuchsia-200/10 text-fuchsia-100 shadow-2xl shadow-fuchsia-950/40">
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        </div>
        <p
          className="mt-4 text-sm font-medium text-slate-200"
          aria-live="polite"
        >
          {stageLabel}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Waiting for provider output
        </p>
      </div>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  worker_claimed: 'Starting worker…',
  provider_submitting: 'Submitting to provider…',
  provider_resubmit_after_crash: 'Resuming after worker restart…',
  inference_started: 'Generating media…',
  inference_completed: 'Finalizing…',
  storage_completed: 'Storing result…',
  storage_failed: 'Storage failed, recording fallback…',
  retry_scheduled: 'Transient error, retry scheduled…',
  failed: 'Failed',
};

function humanizeStage(stage: string | null): string {
  if (!stage) {
    return 'Generating media';
  }
  if (STAGE_LABELS[stage]) {
    return STAGE_LABELS[stage];
  }
  return stage.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-200">{value}</dd>
    </div>
  );
}
