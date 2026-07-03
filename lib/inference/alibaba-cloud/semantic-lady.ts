import 'server-only';

import type { SemanticLadyField } from 'semantic-lady';

import type { SherinModelId } from '@/lib/app-config';

import {
  getAlibabaCloudSemanticModel,
  hasAlibabaCloudModelConfig,
} from './family';

type SemanticParams = Record<string, unknown>;

const SHERIN_LEVEL_GENERATION_KEYS = new Set([
  'generation_output_format',
  'generation_output_number',
  'generation_provider_order',
  'generation_resolution',
]);

export function assertAlibabaCloudSemanticParams(
  modelIdentifier: SherinModelId,
  params: SemanticParams,
) {
  if (!hasAlibabaCloudModelConfig(modelIdentifier)) {
    throwInvalidAlibabaCloudInput(
      `Semantic Lady does not define Alibaba Cloud model ${modelIdentifier}.`,
    );
  }

  const model = getAlibabaCloudSemanticModel(modelIdentifier);
  const fieldByName = new Map<string, SemanticLadyField>(
    model.schema.map((field) => [field.name, field]),
  );

  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('generation_') || value === undefined) {
      continue;
    }

    if (SHERIN_LEVEL_GENERATION_KEYS.has(key)) {
      continue;
    }

    const field = fieldByName.get(key);

    if (!field) {
      throwInvalidAlibabaCloudInput(
        unknownFieldMessage(key, modelIdentifier, model.schema),
      );
    }

    const valueIssue = findFieldValueIssue(field, key, value);

    if (valueIssue) {
      throwInvalidAlibabaCloudInput(valueIssue);
    }
  }

  for (const field of model.schema) {
    if (!field.required) {
      continue;
    }

    if (hasProvidedSemanticValue(params[field.name])) {
      continue;
    }

    throwInvalidAlibabaCloudInput(`${field.name} is required.`);
  }
}

function findFieldValueIssue(
  field: SemanticLadyField,
  key: string,
  value: unknown,
) {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `${key} must be a boolean.`;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return `${key} must be an integer.`;
      }
      return (
        numberEnumIssue(field, key, value) ??
        numberBoundsIssue(field, key, value)
      );
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${key} must be a finite number.`;
      }
      return (
        numberEnumIssue(field, key, value) ??
        numberBoundsIssue(field, key, value)
      );
    case 'enum':
      return enumIssue(field, key, value);
    case 'string':
    case 'url':
      return typeof value === 'string' ? null : `${key} must be a string.`;
    case 'string-array':
    case 'url-array':
      return Array.isArray(value) &&
        value.every((item) => typeof item === 'string' && item.length > 0)
        ? null
        : `${key} must be an array of non-empty strings.`;
    case 'object':
      return value && typeof value === 'object'
        ? null
        : `${key} must be an object or array.`;
    default:
      return null;
  }
}

function enumIssue(field: SemanticLadyField, key: string, value: unknown) {
  if (typeof value !== 'string') {
    return `${key} must be a string.`;
  }

  const allowed = field.enum ?? [];
  const normalized = value.toLowerCase();

  if (
    allowed.some((candidate) => String(candidate).toLowerCase() === normalized)
  ) {
    return null;
  }

  return `${key} must be one of: ${allowed.join(', ')}.`;
}

function numberEnumIssue(field: SemanticLadyField, key: string, value: number) {
  const allowed = (field.enum ?? []).filter(
    (candidate): candidate is number => typeof candidate === 'number',
  );

  if (allowed.length === 0 || allowed.includes(value)) {
    return null;
  }

  return `${key} must be one of: ${allowed.join(', ')}.`;
}

function numberBoundsIssue(
  field: SemanticLadyField,
  key: string,
  value: number,
) {
  if (field.min !== undefined && value < field.min) {
    return `${key} must be >= ${field.min}.`;
  }

  if (field.max !== undefined && value > field.max) {
    return `${key} must be <= ${field.max}.`;
  }

  return null;
}

function hasProvidedSemanticValue(value: unknown) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function unknownFieldMessage(
  key: string,
  modelIdentifier: SherinModelId,
  schema: readonly SemanticLadyField[],
) {
  const supported = schema
    .map((field) => field.name)
    .sort((left, right) => left.localeCompare(right))
    .join(', ');

  return (
    `Unknown generation field "${key}" for model "${modelIdentifier}". ` +
    `Supported generation fields: ${supported}.`
  );
}

function throwInvalidAlibabaCloudInput(message: string): never {
  const error = new Error(message) as Error & {
    isTransient?: boolean;
    statusCode?: number;
  };

  error.statusCode = 400;
  error.isTransient = false;
  throw error;
}
