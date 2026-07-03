import { Fragment, type ReactNode } from 'react';

import {
  DEFAULT_GENERATION_GUIDANCE_SCALE,
  DEFAULT_GENERATION_NUM_INFERENCE_STEPS,
  DEFAULT_GENERATION_OUTPUT_QUALITY,
} from '@/lib/app-config';
import { Input } from '@/components/ui/input';

import {
  Field,
  InputImageUrlsField,
  NumberField,
  OutputFormatField,
  PromptField,
  RatioField,
  ResolutionField,
  Select,
  getFieldDescription,
  getFieldLabel,
} from './form-controls';

type BabySeaFormFieldsProps = {
  defaultOutputFormat: string;
  defaultProviderOrder: string;
  defaultRatio: string;
  defaultResolution?: string;
  inputFile: boolean;
  inputFileLimit: number;
  onPromptChange: (prompt: string) => void;
  outputFormatOptions: string[];
  outputNumber: number;
  prompt: string;
  providerOrderOptions: string[];
  ratioOptions: string[];
  resolutionOptions: string[];
  specificSchema: string[];
};

export function BabySeaFormFields({
  defaultOutputFormat,
  defaultProviderOrder,
  defaultRatio,
  defaultResolution,
  inputFile,
  inputFileLimit,
  onPromptChange,
  outputFormatOptions,
  outputNumber,
  prompt,
  providerOrderOptions,
  ratioOptions,
  resolutionOptions,
  specificSchema,
}: BabySeaFormFieldsProps) {
  const schemaFields: ExtraField[] = specificSchema.map((field) => ({
    key: field,
    label: getFieldLabel(field),
    node: <BabySeaSpecificField key={field} field={field} />,
  }));

  schemaFields.sort((left, right) => left.label.localeCompare(right.label));

  return (
    <div className="space-y-5">
      <PromptField prompt={prompt} onPromptChange={onPromptChange} />

      <div className="grid gap-3 sm:grid-cols-2">
        <RatioField
          defaultRatio={defaultRatio}
          label="Aspect ratio"
          ratioOptions={ratioOptions}
        />

        <OutputFormatField
          defaultOutputFormat={defaultOutputFormat}
          outputFormatOptions={outputFormatOptions}
        />

        <Field
          label="Number of images"
          description={getFieldDescription('generation_output_number')}
        >
          <Input
            readOnly
            name="generation_output_number"
            type="number"
            value={outputNumber}
            className="cursor-not-allowed text-slate-300"
          />
        </Field>

        <Field
          label="Provider order"
          description={getFieldDescription('generation_provider_order')}
        >
          <Select
            name="generation_provider_order"
            defaultValue={defaultProviderOrder}
            options={providerOrderOptions.map((value) => ({ value }))}
          />
        </Field>

        {resolutionOptions.length > 0 ? (
          <ResolutionField
            defaultResolution={defaultResolution ?? resolutionOptions[0] ?? ''}
            resolutionOptions={resolutionOptions}
          />
        ) : null}

        {inputFile ? (
          <InputImageUrlsField
            descriptionKey="generation_input_file"
            maxUrls={inputFileLimit}
            name="generation_input_file"
          />
        ) : null}

        {schemaFields.map((field) => (
          <Fragment key={field.key}>{field.node}</Fragment>
        ))}
      </div>
    </div>
  );
}

type ExtraField = {
  key: string;
  label: string;
  node: ReactNode;
};

function BabySeaSpecificField({ field }: { field: string }) {
  const name = `babysea:${field}`;

  if (field.includes('enhance_prompt')) {
    return (
      <Field
        label={getFieldLabel(field)}
        description={getFieldDescription(field)}
      >
        <Select
          name={name}
          defaultValue="off"
          options={[
            { value: 'off', label: 'Off' },
            { value: 'standard', label: 'Standard' },
          ]}
        />
      </Field>
    );
  }

  if (field.includes('moderation')) {
    return (
      <Field
        label={getFieldLabel(field)}
        description={getFieldDescription(field)}
      >
        <Select
          name={name}
          defaultValue="false"
          options={[
            { value: 'false', label: 'Off' },
            { value: 'true', label: 'On' },
          ]}
        />
      </Field>
    );
  }

  if (field.includes('output_quality')) {
    return (
      <NumberField
        defaultValue={DEFAULT_GENERATION_OUTPUT_QUALITY}
        description={getFieldDescription(field)}
        label={getFieldLabel(field)}
        name={name}
        min={0}
        max={100}
      />
    );
  }

  if (field.includes('guidance_scale')) {
    return (
      <NumberField
        defaultValue={DEFAULT_GENERATION_GUIDANCE_SCALE}
        description={getFieldDescription(field)}
        label={getFieldLabel(field)}
        name={name}
        min={0}
        max={20}
        step="0.1"
      />
    );
  }

  if (field.includes('num_inference_steps')) {
    return (
      <NumberField
        defaultValue={DEFAULT_GENERATION_NUM_INFERENCE_STEPS}
        description={getFieldDescription(field)}
        label={getFieldLabel(field)}
        name={name}
        min={1}
        max={100}
      />
    );
  }

  if (field.includes('seed')) {
    return (
      <NumberField
        description={getFieldDescription(field)}
        label={getFieldLabel(field)}
        name={name}
        min={0}
        max={2_147_483_647}
      />
    );
  }

  return (
    <Field
      label={getFieldLabel(field)}
      description={getFieldDescription(field)}
    >
      <Input name={name} placeholder="Optional" />
    </Field>
  );
}
