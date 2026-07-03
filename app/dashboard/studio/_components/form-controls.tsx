'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  InlineHappyHorse,
  InlineQwen,
  InlineWan,
  InlineZImage,
} from '@/components/icons/inline-model';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  GENERATION_PROMPT_PLACEHOLDER,
  MODEL_OPTIONS,
  type SherinModelId,
} from '@/lib/app-config';
import generationDescriptions from '@/lib/generation/descriptions.json';

const fieldDescriptions = generationDescriptions.fields as Record<
  string,
  string | undefined
>;

type SelectOption = {
  label?: string;
  value: string;
};

type ModelOption = {
  readonly id: SherinModelId;
  readonly label: string;
};

type InputImageSource = 'url' | 'upload';

const INPUT_IMAGE_SOURCE_OPTIONS = [
  { value: 'url', label: 'URLs' },
  { value: 'upload', label: 'Upload' },
] as const satisfies Array<{ value: InputImageSource; label: string }>;

export function PromptField({
  onPromptChange,
  prompt,
  required = true,
}: {
  onPromptChange?: (prompt: string) => void;
  prompt?: string;
  required?: boolean;
}) {
  return (
    <Field
      label="Prompt"
      description={getFieldDescription('generation_prompt')}
    >
      <Textarea
        required={required}
        name="prompt"
        rows={6}
        placeholder={GENERATION_PROMPT_PLACEHOLDER}
        value={prompt}
        onChange={
          onPromptChange
            ? (event) => onPromptChange(event.target.value)
            : undefined
        }
        className="min-h-40 resize-y"
      />
    </Field>
  );
}

export function ModelField({
  model,
  onModelChange,
  modelOptions = MODEL_OPTIONS,
}: {
  model: SherinModelId;
  onModelChange: (model: SherinModelId) => void;
  modelOptions?: readonly ModelOption[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const selectedOption = modelOptions.find((option) => option.id === model);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="block text-sm font-medium text-slate-200">
      <span>Model</span>
      <input type="hidden" name="model" value={model} />

      <span ref={rootRef} className="relative mt-2 block">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left text-sm text-white outline-none transition focus-visible:border-fuchsia-300/60 focus-visible:ring-2 focus-visible:ring-fuchsia-300/10"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <ModelVendorIcon modelId={model} />
            <span className="truncate">{selectedOption?.label ?? model}</span>
          </span>

          <span
            aria-hidden="true"
            className="pointer-events-none size-4 shrink-0 text-slate-500"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {open ? (
          <span
            role="listbox"
            aria-label="Model"
            className="absolute left-0 right-0 top-full z-50 mt-2 block max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-1 text-sm text-slate-100 shadow-2xl"
          >
            {modelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === model}
                className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left transition hover:bg-white/10 focus:bg-white/10 focus:outline-none aria-selected:bg-fuchsia-300/10 aria-selected:text-fuchsia-100"
                onClick={() => {
                  setOpen(false);
                  onModelChange(option.id);
                }}
              >
                <ModelVendorIcon modelId={option.id} />
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function ModelVendorIcon({ modelId }: { modelId: string }) {
  const Icon = modelVendorIcon(modelId);

  if (!Icon) {
    return null;
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[#48d1cc1a]">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
    </span>
  );
}

function modelVendorIcon(modelId: string) {
  if (modelId.startsWith('qwen/')) {
    return InlineQwen;
  }

  if (modelId.startsWith('wan/')) {
    return InlineWan;
  }

  if (modelId.startsWith('happyhorse/')) {
    return InlineHappyHorse;
  }

  if (modelId.startsWith('z/')) {
    return InlineZImage;
  }

  return null;
}

export function RatioField({
  defaultRatio,
  description = getFieldDescription('generation_ratio'),
  label,
  ratioOptions,
}: {
  defaultRatio: string;
  description?: string;
  label: string;
  ratioOptions: string[];
}) {
  return (
    <Field label={label} description={description}>
      <Select
        name="ratio"
        defaultValue={defaultRatio}
        options={ratioOptions.map((ratio) => ({
          value: ratio,
          label: ratio,
        }))}
      />
    </Field>
  );
}

export function OutputFormatField({
  defaultOutputFormat,
  description = getFieldDescription('generation_output_format'),
  outputFormatOptions,
}: {
  defaultOutputFormat: string;
  description?: string;
  outputFormatOptions: string[];
}) {
  return (
    <Field label="Output format" description={description}>
      <Select
        name="output_format"
        defaultValue={defaultOutputFormat}
        options={outputFormatOptions.map((format) => ({
          value: format,
          label: format.toUpperCase(),
        }))}
      />
    </Field>
  );
}

export function ResolutionField({
  defaultResolution,
  resolutionOptions,
}: {
  defaultResolution: string;
  resolutionOptions: string[];
}) {
  if (resolutionOptions.length === 0) {
    return null;
  }

  return (
    <Field
      label="Resolution"
      description={getFieldDescription('generation_resolution')}
    >
      <Select
        name="generation_resolution"
        defaultValue={defaultResolution}
        options={resolutionOptions.map((resolution) => ({
          value: resolution,
        }))}
      />
    </Field>
  );
}

export function InputImageUrlsField({
  descriptionKey,
  maxUrls,
  name,
  required = false,
}: {
  descriptionKey: string;
  maxUrls: number;
  name: string;
  required?: boolean;
}) {
  const [source, setSource] = useState<InputImageSource>('url');
  const sourceFieldName = `${name}_source`;
  const uploadFieldName = `${name}_upload`;

  return (
    <Field
      className="sm:col-span-2"
      label="Input image"
      description={inputImageDescription(descriptionKey, maxUrls)}
    >
      <input type="hidden" name={sourceFieldName} value={source} />

      <span
        role="radiogroup"
        aria-label="Input image source"
        className="grid gap-2 sm:grid-cols-2"
      >
        {INPUT_IMAGE_SOURCE_OPTIONS.map((option) => {
          const selected = option.value === source;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setSource(option.value)}
              className={`h-10 rounded-xl border px-3 text-sm font-medium transition ${
                selected
                  ? 'border-fuchsia-300/60 bg-white text-slate-950 shadow-sm shadow-fuchsia-950/20'
                  : 'border-white/10 bg-slate-950/80 text-slate-300 hover:border-white/20 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </span>

      <span className="mt-3 block">
        {source === 'url' ? (
          <Textarea
            name={name}
            required={required}
            rows={3}
            placeholder={
              maxUrls === 1
                ? `${required ? '' : 'Optional. '}https://example.com/input.png`
                : `${required ? '' : 'Optional. '}https://example.com/input.png, https://example.com/reference.jpg`
            }
            className="resize-y"
          />
        ) : (
          <Input
            name={uploadFieldName}
            type="file"
            required={required}
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple={maxUrls > 1}
            className="h-auto min-h-10 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
          />
        )}
      </span>
    </Field>
  );
}

export function InputVideoUrlsField({
  descriptionKey,
  maxUrls,
  name,
  required = false,
}: {
  descriptionKey: string;
  maxUrls: number;
  name: string;
  required?: boolean;
}) {
  const [source, setSource] = useState<InputImageSource>('url');
  const sourceFieldName = `${name}_source`;
  const uploadFieldName = `${name}_upload`;

  return (
    <Field
      className="sm:col-span-2"
      label="Input video"
      description={inputMediaDescription(descriptionKey, maxUrls, 'video')}
    >
      <input type="hidden" name={sourceFieldName} value={source} />

      <span
        role="radiogroup"
        aria-label="Input video source"
        className="grid gap-2 sm:grid-cols-2"
      >
        {INPUT_IMAGE_SOURCE_OPTIONS.map((option) => {
          const selected = option.value === source;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setSource(option.value)}
              className={`h-10 rounded-xl border px-3 text-sm font-medium transition ${
                selected
                  ? 'border-fuchsia-300/60 bg-white text-slate-950 shadow-sm shadow-fuchsia-950/20'
                  : 'border-white/10 bg-slate-950/80 text-slate-300 hover:border-white/20 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </span>

      <span className="mt-3 block">
        {source === 'url' ? (
          <Textarea
            name={name}
            required={required}
            rows={3}
            placeholder={
              maxUrls === 1
                ? `${required ? '' : 'Optional. '}https://example.com/input.mp4`
                : `${required ? '' : 'Optional. '}https://example.com/input-1.mp4, https://example.com/input-2.mp4`
            }
            className="resize-y"
          />
        ) : (
          <Input
            name={uploadFieldName}
            type="file"
            required={required}
            accept="video/mp4,video/webm,video/quicktime"
            multiple={maxUrls > 1}
            className="h-auto min-h-10 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
          />
        )}
      </span>
    </Field>
  );
}

export function Base64ImagePromptField({
  descriptionKey,
  name,
}: {
  descriptionKey: string;
  name: string;
}) {
  return (
    <Field
      className="sm:col-span-2"
      label="Input image (base64)"
      description={base64ImagePromptDescription(descriptionKey)}
    >
      <Textarea
        name={name}
        rows={4}
        placeholder="Optional. Base64 encoded jpeg, png, gif, or webp image."
        className="resize-y font-mono text-xs"
      />
    </Field>
  );
}

export function NumberField({
  defaultValue,
  description,
  label,
  name,
  min,
  max,
  required = false,
  step,
}: {
  defaultValue?: number | string;
  description?: string;
  label: string;
  name: string;
  min: number;
  max: number;
  required?: boolean;
  step?: string;
}) {
  return (
    <Field label={label} description={description}>
      <Input
        name={name}
        type="number"
        min={min}
        max={max}
        required={required}
        step={step}
        defaultValue={defaultValue}
        placeholder={defaultValue === undefined ? 'Optional' : undefined}
      />
    </Field>
  );
}

export function Field({
  children,
  className,
  description,
  label,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  label: string;
}) {
  return (
    <Label className={className}>
      <span>{label}</span>
      <span className="mt-2 block">{children}</span>
      <FieldDescription>{description}</FieldDescription>
    </Label>
  );
}

export function FieldDescription({ children }: { children?: string }) {
  if (!children) {
    return null;
  }

  return (
    <span className="mt-1 block text-xs leading-5 text-slate-500">
      {punctuateDescription(children)}
    </span>
  );
}

export function getFieldDescription(field: string) {
  return fieldDescriptions[field];
}

export function getFieldLabel(field: string) {
  return field
    .replace(/^generation_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function punctuateDescription(description: string) {
  return /[.!?]$/.test(description) ? description : `${description}.`;
}

function inputImageDescription(descriptionKey: string, maxUrls: number) {
  return inputMediaDescription(descriptionKey, maxUrls, 'image');
}

function inputMediaDescription(
  descriptionKey: string,
  maxUrls: number,
  mediaLabel: 'image' | 'video',
) {
  const baseDescription = getFieldDescription(descriptionKey);
  const maxLabel =
    maxUrls === 1 ? `1 ${mediaLabel}` : `${maxUrls} ${mediaLabel}s`;
  const urlDescription = `Max ${maxLabel}`;

  return [baseDescription, urlDescription].filter(Boolean).join('. ');
}

function base64ImagePromptDescription(descriptionKey: string) {
  const baseDescription = getFieldDescription(descriptionKey);
  const base64Description = 'Paste one image only';

  return [baseDescription, base64Description].filter(Boolean).join('. ');
}

export function Select({
  name,
  defaultValue,
  onChange,
  options,
  placeholder = 'Select',
  value,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
}) {
  const selectedValue = value ?? defaultValue ?? '';
  const valueProps = value === undefined ? { defaultValue } : { value };

  return (
    <span className="relative block">
      <select
        name={name}
        {...valueProps}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="block h-10 w-full appearance-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 pr-9 text-sm text-white outline-none transition focus:border-fuchsia-300/60 focus:ring-2 focus:ring-fuchsia-300/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!selectedValue ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </span>
  );
}
