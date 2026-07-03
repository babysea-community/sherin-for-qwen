'use client';

import { useCallback, useState } from 'react';
import { Hourglass, ImageMinus, ImageOff } from 'lucide-react';
import { ImageLoadingSkeleton } from '../../_components/image-loading-skeleton';

export function GalleryPreviewPanel({
  previewUrl,
  previewContentType,
  priority = false,
  prompt,
  ratio,
  status,
}: {
  previewUrl: string | null;
  previewContentType?: string | null;
  priority?: boolean;
  prompt: string;
  ratio: string;
  status: string;
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [unavailablePreviewUrl, setUnavailablePreviewUrl] = useState<
    string | null
  >(null);
  const previewIsVideo = previewContentType?.startsWith('video/') ?? false;

  const previewLoaded = Boolean(previewUrl && loadedPreviewUrl === previewUrl);
  const previewUnavailable = Boolean(
    previewUrl && unavailablePreviewUrl === previewUrl,
  );
  const showPreview = Boolean(previewUrl && !previewUnavailable);
  const showLoadingPreview = showPreview && !previewLoaded;
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

  if (showPreview && previewUrl) {
    if (previewIsVideo) {
      return (
        <div
          aria-busy={showLoadingPreview}
          className="relative mt-4 block aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
        >
          {showLoadingPreview ? <ImageLoadingSkeleton /> : null}
          <video
            src={previewUrl}
            aria-label={`Generated video for: ${prompt}`}
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
          <RatioOverlay ratio={ratio} />
        </div>
      );
    }

    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Open generated image"
        aria-busy={showLoadingPreview}
        className="group relative mt-4 block aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
      >
        {showLoadingPreview ? <ImageLoadingSkeleton /> : null}
        <img
          ref={handlePreviewImageRef}
          src={previewUrl}
          alt={`Generated image for: ${prompt}`}
          className={`absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.02] ${
            previewLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
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
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <RatioOverlay ratio={ratio} />
      </a>
    );
  }

  const failed = status === 'failed';
  const missing =
    Boolean(previewUrl && previewUnavailable) ||
    status === 'succeeded' ||
    status === 'unavailable';
  const fallbackIcon = failed ? (
    <ImageOff className="size-5" aria-hidden="true" />
  ) : missing ? (
    <ImageMinus className="size-5" aria-hidden="true" />
  ) : (
    <Hourglass className="size-5" aria-hidden="true" />
  );

  return (
    <div className="relative mt-4 flex aspect-[4/3] items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-center">
      <RatioOverlay ratio={ratio} />

      <div>
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
          {fallbackIcon}
        </div>
        <p className="mt-3 text-sm font-medium text-slate-200">
          {failed ? 'Failed' : missing ? 'Unavailable' : 'No output yet'}
        </p>
      </div>
    </div>
  );
}

function RatioOverlay({ ratio }: { ratio: string }) {
  return (
    <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[0.68rem] font-medium leading-none text-slate-200 shadow-lg shadow-black/20 backdrop-blur">
      {ratio}
    </span>
  );
}
