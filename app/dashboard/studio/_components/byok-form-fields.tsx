import { Fragment, type ReactNode } from 'react';
import type { SemanticLadyField } from 'semantic-lady';

import { DEFAULT_GENERATION_OUTPUT_NUMBER } from '@/lib/app-config';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  Base64ImagePromptField,
  Field,
  InputImageUrlsField,
  InputVideoUrlsField,
  NumberField,
  OutputFormatField,
  PromptField,
  RatioField,
  Select,
  getFieldLabel,
} from './form-controls';

type ByokFormFieldsProps = {
  defaultOutputFormat: string;
  defaultRatio: string;
  inputFileLimit: number;
  onPromptChange: (prompt: string) => void;
  outputFormatOptions: string[];
  prompt: string;
  ratioOptions: string[];
  schema: readonly SemanticLadyField[];
  videoInputFileLimit?: number;
};

type FieldContext = {
  defaultOutputFormat: string;
  defaultRatio: string;
  inputFileLimit: number;
  outputFormatOptions: string[];
  ratioOptions: string[];
  videoInputFileLimit: number;
};

// The prompt is rendered on its own above the grid; provider order is a
// Sherin-level control handled elsewhere. Every other field is rendered in the
// order Semantic Lady already sorts the schema: core fields first (in the
// canonical CORE_FIELD_ORDER), then advanced fields alphabetically by name.
const HANDLED_OUTSIDE_GRID = new Set([
  'generation_prompt',
  'generation_provider_order',
]);

export function ByokFormFields({
  defaultOutputFormat,
  defaultRatio,
  inputFileLimit,
  onPromptChange,
  outputFormatOptions,
  prompt,
  ratioOptions,
  schema,
  videoInputFileLimit = 0,
}: ByokFormFieldsProps) {
  const promptField = fieldByName(schema, 'generation_prompt');
  const context: FieldContext = {
    defaultOutputFormat,
    defaultRatio,
    inputFileLimit,
    outputFormatOptions,
    ratioOptions,
    videoInputFileLimit,
  };

  return (
    <div className="space-y-5">
      {promptField ? (
        <PromptField
          prompt={prompt}
          required={Boolean(promptField.required)}
          onPromptChange={onPromptChange}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {schema
          .filter((field) => !HANDLED_OUTSIDE_GRID.has(field.name))
          .map((field) => {
            const node = renderSchemaField(field, context);

            return node ? <Fragment key={field.name}>{node}</Fragment> : null;
          })}
      </div>
    </div>
  );
}

function renderSchemaField(
  field: SemanticLadyField,
  context: FieldContext,
): ReactNode {
  const label = getFieldLabel(field.name);
  const description = field.description;

  if (field.name === 'generation_negative_prompt') {
    return (
      <Field className="sm:col-span-2" label={label} description={description}>
        <Textarea
          name={field.name}
          rows={4}
          required={field.required}
          defaultValue={fieldStringDefault(field)}
          placeholder={field.placeholder ?? 'Optional'}
          className="min-h-28 resize-y"
        />
      </Field>
    );
  }

  if (
    field.name === 'generation_size' ||
    field.name === 'generation_aspect_ratio'
  ) {
    const options = fieldStringEnum(field, []);

    // Enum sizing (aspect ratio / fixed size list) renders as a dropdown; a
    // free-form size (e.g. Qwen "1024*1024") renders as a text input so the
    // user can enter any supported dimensions. This mirrors babychain, which
    // picks the control from the field type instead of forcing a dropdown.
    if (options.length > 0) {
      return (
        <RatioField
          defaultRatio={fieldStringDefault(field) ?? context.defaultRatio}
          description={description}
          label={label}
          ratioOptions={options}
        />
      );
    }

    return (
      <Field label={label} description={description}>
        <Input
          name="ratio"
          required={field.required}
          defaultValue={fieldStringDefault(field) ?? context.defaultRatio}
          placeholder={field.placeholder ?? 'e.g. 1024*1024'}
        />
      </Field>
    );
  }

  if (field.name === 'generation_output_format') {
    return (
      <OutputFormatField
        defaultOutputFormat={
          fieldStringDefault(field) ?? context.defaultOutputFormat
        }
        description={description}
        outputFormatOptions={fieldStringEnum(
          field,
          context.outputFormatOptions,
        )}
      />
    );
  }

  if (field.name === 'generation_output_number') {
    return (
      <Field label="Number of outputs" description={description}>
        <Input
          readOnly
          name="generation_output_number"
          type="number"
          value={DEFAULT_GENERATION_OUTPUT_NUMBER}
          className="cursor-not-allowed text-slate-300"
        />
      </Field>
    );
  }

  if (field.name === 'generation_input_image_file') {
    return context.inputFileLimit > 0 ? (
      <InputImageUrlsField
        descriptionKey={field.name}
        maxUrls={context.inputFileLimit}
        name="generation_input_file"
        required={Boolean(field.required)}
      />
    ) : (
      <Base64ImagePromptField
        descriptionKey="byok_image_prompt"
        name="byok_image_prompt"
      />
    );
  }

  if (field.name === 'generation_input_video_file') {
    return context.videoInputFileLimit > 0 ? (
      <InputVideoUrlsField
        descriptionKey={field.name}
        maxUrls={context.videoInputFileLimit}
        name="generation_input_video_file"
        required={Boolean(field.required)}
      />
    ) : null;
  }

  return <SchemaField field={field} label={label} description={description} />;
}

function SchemaField({
  field,
  label,
  description,
}: {
  field: SemanticLadyField;
  label: string;
  description?: string;
}) {
  if (field.type === 'boolean') {
    return (
      <Field label={label} description={description}>
        <Select
          name={field.name}
          defaultValue={fieldBooleanDefault(field)}
          options={[
            { value: 'false', label: 'Off' },
            { value: 'true', label: 'On' },
          ]}
          placeholder="Provider default"
        />
      </Field>
    );
  }

  if (field.type === 'enum') {
    const options = fieldStringEnum(field, []);

    return (
      <Field label={label} description={description}>
        <Select
          name={field.name}
          defaultValue={fieldStringDefault(field) ?? options[0] ?? ''}
          options={options.map((value) => ({ value }))}
        />
      </Field>
    );
  }

  if (field.type === 'integer' || field.type === 'number') {
    return (
      <NumberField
        defaultValue={fieldNumberDefault(field)}
        description={description}
        label={label}
        name={field.name}
        min={field.min ?? 0}
        max={field.max ?? Number.MAX_SAFE_INTEGER}
        required={Boolean(field.required)}
        step={field.type === 'number' ? '0.1' : undefined}
      />
    );
  }

  return (
    <Field label={label} description={description}>
      <Input
        name={field.name}
        required={field.required}
        defaultValue={fieldStringDefault(field)}
        placeholder={field.placeholder ?? 'Optional'}
      />
    </Field>
  );
}

function fieldByName(schema: readonly SemanticLadyField[], name: string) {
  return schema.find((field) => field.name === name);
}

function fieldStringEnum(
  field: SemanticLadyField,
  fallback: readonly string[],
) {
  const values = (field.enum ?? []).filter(
    (value): value is string => typeof value === 'string',
  );

  return values.length > 0 ? values : [...fallback];
}

function fieldStringDefault(field: SemanticLadyField) {
  return typeof field.default === 'string' ? field.default : undefined;
}

function fieldNumberDefault(field: SemanticLadyField) {
  return typeof field.default === 'number' ? field.default : undefined;
}

function fieldBooleanDefault(field: SemanticLadyField) {
  return typeof field.default === 'boolean' ? String(field.default) : undefined;
}
