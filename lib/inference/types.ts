import type { ByokInferenceProviderId, SherinModelId } from '@/lib/app-config';

export type InferenceProviderId = 'babysea' | ByokInferenceProviderId;
export type InferenceByokParamValue = string | number | boolean | string[];
export type InferenceByokParams = Record<string, InferenceByokParamValue>;

export type InferenceRequest = {
  model: SherinModelId;
  prompt: string;
  ratio: string;
  resolution?: string;
  outputFormat: string;
  outputNumber: number;
  providerOrder: string;
  inputFiles: string[];
  babyseaSpecificParams: Record<string, string | number | boolean>;
  byokParams: InferenceByokParams;
};

export type InferencePreparedRequest = {
  inputImageLimit: number;
  inputVideoLimit?: number;
  request: InferenceRequest;
};

export type InferenceProviderSubmitPolicy = {
  maxSubmitAttemptsWithoutProviderId: number;
};

export type InferenceResult = {
  providerId: InferenceProviderId;
  remoteUrl: string;
  contentType: string;
  metadata: Record<string, unknown>;
};

export type InferenceGenerateOptions = {
  idempotencyKey?: string;
  /** Server-owned provider generation id used to resume polling without resubmitting. */
  providerGenerationId?: string;
  onPreSubmit?: (metadata: Record<string, unknown>) => Promise<void> | void;
  onStarted?: (metadata: Record<string, unknown>) => Promise<void> | void;
  resumeMetadata?: Record<string, unknown> | null;
};

export type InferenceCancelResult = {
  /** True when a provider cancel API call was actually issued. */
  attempted: boolean;
  /** True when the provider acknowledged the cancellation. */
  acknowledged: boolean;
  /** Reason when the cancel was not attempted or not acknowledged. */
  error?: string;
};

export interface InferenceProvider {
  readonly id: InferenceProviderId;
  readonly label: string;
  readonly submitPolicy?: InferenceProviderSubmitPolicy;
  extractProviderGenerationId?(
    metadata: Record<string, unknown>,
  ): string | null;
  cancel?(providerGenerationId: string): Promise<InferenceCancelResult>;
  prepareRequest?(input: {
    formData: FormData;
    request: InferenceRequest;
  }): InferencePreparedRequest | Promise<InferencePreparedRequest>;
  generate(
    request: InferenceRequest,
    options?: InferenceGenerateOptions,
  ): Promise<InferenceResult>;
}
