'use client';

import { Loader2, WandSparkles } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

export function GenerateSubmitButton({
  disabled,
  locked = false,
}: {
  disabled: boolean;
  locked?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || locked || pending;
  const isBusy = locked || pending;

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      size="lg"
      className="w-full rounded-2xl font-semibold"
    >
      {isBusy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <WandSparkles className="size-4" aria-hidden="true" />
      )}
      {pending
        ? 'Starting generation'
        : locked
          ? 'Generation in progress'
          : disabled
            ? 'Configure an inference provider'
            : 'Generate image'}
    </Button>
  );
}
