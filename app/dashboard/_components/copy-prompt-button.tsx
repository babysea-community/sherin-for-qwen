'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

function useCopyFeedback(successMessage: string) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(successMessage);

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      toast.error('Could not copy.');
    }
  }

  return { copied, copy };
}

export function CopyPromptButton({ prompt }: { prompt: string }) {
  const { copied, copy } = useCopyFeedback('Prompt copied.');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 text-slate-400 hover:bg-white/5 hover:text-white"
      aria-label="Copy prompt"
      title="Copy prompt"
      onClick={() => void copy(prompt)}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

export function CopyReferenceUrlButton({
  urlEndpoint,
}: {
  urlEndpoint: string;
}) {
  const { copied, copy } = useCopyFeedback('Image URL copied.');

  async function copyReferenceUrl() {
    try {
      const response = await fetch(urlEndpoint, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        url?: unknown;
      };

      if (!response.ok) {
        throw new Error(errorMessageFromCopyResponse(response.status, result));
      }

      if (typeof result.url !== 'string' || result.url.length === 0) {
        throw new Error('Could not resolve image URL.');
      }

      await copy(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not copy image URL.',
      );
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 text-slate-400 hover:bg-white/5 hover:text-white"
      aria-label="Copy image URL"
      title="Copy image URL"
      onClick={() => void copyReferenceUrl()}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

function errorMessageFromCopyResponse(
  status: number,
  result: { error?: unknown },
) {
  if (typeof result.error === 'string' && result.error.length > 0) {
    return result.error;
  }

  if (status === 401) {
    return 'Sign in to copy this image URL.';
  }

  if (status === 404) {
    return 'Reference image URL is unavailable.';
  }

  return 'Could not copy image URL.';
}

export function GenerationIdText({ generationId }: { generationId: string }) {
  return (
    <p className="max-w-full break-all font-mono text-[0.68rem] leading-4 text-slate-500">
      {generationId}
    </p>
  );
}
