import 'server-only';

import { getOptionalEnv, getOptionalPositiveIntEnv } from '@/lib/utils/env';

import {
  ALIBABACLOUD_PROVIDER_ID,
  type AlibabaCloudModelConfig,
} from './family';
import { resolveAlibabaCloudModelConfig } from './models';
import { assertAlibabaCloudSemanticParams } from './semantic-lady';
import type {
  InferenceByokParams,
  InferenceCancelResult,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
} from '../types';

const ALIBABACLOUD_HOST = 'dashscope-intl.aliyuncs.com';
const ALIBABACLOUD_BASE_URL = `https://${ALIBABACLOUD_HOST}`;
const POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 45_000;
const POLL_TIMEOUT_MS =
  getOptionalPositiveIntEnv('INFERENCE_POLL_TIMEOUT_MS') ??
  DEFAULT_POLL_TIMEOUT_MS;
const REQUEST_TIMEOUT_MS = 30_000;

const MULTIMODAL_SYNC_IMAGE_MODELS = new Set([
  'qwen-image',
  'qwen-image-plus',
  'qwen-image-2.0',
  'qwen-image-2.0-pro',
  'qwen-image-max',
  'qwen-image-edit',
  'qwen-image-edit-max',
  'qwen-image-edit-plus',
  'wan2.6-image',
  'wan2.6-t2i',
  'wan2.7-image',
  'wan2.7-image-pro',
  'z-image-turbo',
]);

const ASYNC_IMAGE_TO_IMAGE_MODELS = new Set([
  'wan2.5-i2i-preview',
  'wanx2.1-imageedit',
]);

const VIDEO_GENERATION_MODELS = new Set([
  'happyhorse-1.0-t2v',
  'happyhorse-1.0-i2v',
  'happyhorse-1.0-r2v',
  'happyhorse-1.0-video-edit',
  'wan2.7-t2v',
  'wan2.7-i2v-2026-04-25',
  'wan2.7-r2v',
  'wan2.7-videoedit',
]);

const ANIMATE_IMAGE_TO_VIDEO_MODELS = new Set([
  'wan2.2-animate-mix',
  'wan2.2-animate-move',
]);

const ANIMATE_PARAMETER_KEYS = new Set(['check_image', 'mode']);

const VIDEO_PARAMETER_KEYS_BY_MODEL: Record<string, readonly string[]> = {
  'happyhorse-1.0-t2v': [
    'duration',
    'ratio',
    'resolution',
    'seed',
    'watermark',
  ],
  'happyhorse-1.0-i2v': ['duration', 'resolution', 'seed', 'watermark'],
  'happyhorse-1.0-r2v': [
    'duration',
    'ratio',
    'resolution',
    'seed',
    'watermark',
  ],
  'happyhorse-1.0-video-edit': [
    'audio_setting',
    'resolution',
    'seed',
    'watermark',
  ],
  'wan2.7-t2v': [
    'duration',
    'prompt_extend',
    'ratio',
    'resolution',
    'seed',
    'watermark',
  ],
  'wan2.7-i2v-2026-04-25': [
    'duration',
    'prompt_extend',
    'resolution',
    'seed',
    'watermark',
  ],
  'wan2.7-r2v': [
    'duration',
    'prompt_extend',
    'ratio',
    'resolution',
    'seed',
    'watermark',
  ],
  'wan2.7-videoedit': [
    'audio_setting',
    'duration',
    'prompt_extend',
    'ratio',
    'resolution',
    'seed',
    'watermark',
  ],
};

type AlibabaCloudProtocol =
  'animate_image_to_video' | 'image_task' | 'multimodal' | 'video';

type AlibabaCloudRoute = {
  async: boolean;
  kind: 'sync_image' | 'image_task' | 'video_task';
  path: string;
  protocol: AlibabaCloudProtocol;
};

type AlibabaCloudRequestParams = {
  audioSetting?: string;
  checkImage?: boolean;
  duration?: number;
  editFunction?: string;
  mask?: string;
  mode?: string;
  negativePrompt?: string;
  promptExtend?: boolean;
  seed?: number;
  videoInputFiles: string[];
  lastFrameFiles: string[];
  watermark?: boolean;
};

type AlibabaCloudJsonObject = Record<string, unknown>;

type AlibabaCloudTaskResponse = {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    task_id?: string;
    task_status?: string;
    image_url?: string;
    video_url?: string;
    code?: string;
    message?: string;
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; video_url?: string; url?: string }>;
      };
    }>;
    results?: Array<{ url?: string; image_url?: string; video_url?: string }>;
  };
};

export function isAlibabaCloudConfigured() {
  return Boolean(readAlibabaCloudApiKey());
}

export function createAlibabaCloudProvider(): InferenceProvider {
  const apiKey = requireAlibabaCloudApiKey();

  return {
    id: ALIBABACLOUD_PROVIDER_ID,
    label: 'Alibaba Cloud',
    submitPolicy: { maxSubmitAttemptsWithoutProviderId: 2 },
    extractProviderGenerationId(metadata) {
      const value = metadata.alibabacloud_task_id;

      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async cancel(): Promise<InferenceCancelResult> {
      return {
        attempted: false,
        acknowledged: false,
        error: 'Alibaba Cloud does not support canceling generations.',
      };
    },
    prepareRequest({ formData, request }) {
      const modelConfig = resolveAlibabaCloudModelConfig(request.model);
      const params = mergeAlibabaCloudPreflightParams(
        readAlibabaCloudParamsFromFormData(formData, modelConfig),
        request.byokParams,
        modelConfig,
      );
      const preparedRequest = {
        ...request,
        byokParams: params,
        outputFormat: modelConfig.outputFormats[0] ?? request.outputFormat,
        ratio: clampRatio(request.ratio, modelConfig),
        resolution: clampResolution(request.resolution, modelConfig),
      };
      const resolvedParams = resolveAlibabaCloudParams(params, modelConfig);
      const semanticParams = createAlibabaCloudSemanticParams(
        preparedRequest,
        modelConfig,
        resolvedParams,
      );

      assertAlibabaCloudSemanticParams(request.model, semanticParams);
      assertAlibabaCloudRequestMatchesModelConfig(
        preparedRequest,
        modelConfig,
        resolvedParams,
      );

      return {
        inputImageLimit: modelConfig.inputImageLimit,
        inputVideoLimit: modelConfig.inputVideoLimit,
        request: preparedRequest,
      };
    },
    async generate(
      request: InferenceRequest,
      options,
    ): Promise<InferenceResult> {
      const modelConfig = resolveAlibabaCloudModelConfig(request.model);
      const route = routeForAlibabaCloudModel(modelConfig);
      const params = resolveAlibabaCloudParams(request.byokParams, modelConfig);
      const semanticParams = createAlibabaCloudSemanticParams(
        request,
        modelConfig,
        params,
      );

      assertAlibabaCloudSemanticParams(request.model, semanticParams);
      assertAlibabaCloudRequestMatchesModelConfig(request, modelConfig, params);

      if (route.async) {
        return generateAsync({
          apiKey,
          modelConfig,
          options,
          params,
          request,
          route,
        });
      }

      return generateSync({
        apiKey,
        modelConfig,
        options,
        params,
        request,
        route,
      });
    },
  };
}

async function generateAsync({
  apiKey,
  modelConfig,
  options,
  params,
  request,
  route,
}: {
  apiKey: string;
  modelConfig: AlibabaCloudModelConfig;
  options: Parameters<InferenceProvider['generate']>[1];
  params: AlibabaCloudRequestParams;
  request: InferenceRequest;
  route: AlibabaCloudRoute;
}): Promise<InferenceResult> {
  const resumeTaskId = options?.providerGenerationId ?? null;

  if (resumeTaskId) {
    const metadata = createAlibabaCloudMetadata({
      modelConfig,
      params,
      request,
      resumed: true,
      route,
      taskId: resumeTaskId,
    });

    await options?.onStarted?.(metadata);

    const polled = await pollAlibabaCloudTask(resumeTaskId, apiKey);
    const remoteUrl = firstAlibabaCloudOutput(polled);

    return {
      providerId: ALIBABACLOUD_PROVIDER_ID,
      remoteUrl,
      contentType: modelConfig.outputContentType,
      metadata: {
        ...metadata,
        alibabacloud_remote_url: remoteUrl,
        alibabacloud_status: polled.output?.task_status ?? null,
      },
    };
  }

  await options?.onPreSubmit?.({
    sherin_model_id: request.model,
    sherin_provider: ALIBABACLOUD_PROVIDER_ID,
    sherin_stage: 'provider_submitting',
    alibabacloud_endpoint: route.path,
    alibabacloud_model: modelConfig.providerModel,
  });

  const submitResponse = await fetch(`${ALIBABACLOUD_BASE_URL}${route.path}`, {
    method: 'POST',
    headers: alibabaCloudHeaders(apiKey, true),
    body: JSON.stringify(
      buildAlibabaCloudRequestBody(request, modelConfig, route, params),
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!submitResponse.ok) {
    throw await buildAlibabaCloudHttpError(
      'Alibaba Cloud request',
      submitResponse,
    );
  }

  const submitJson = (await submitResponse.json()) as AlibabaCloudTaskResponse;
  const taskId = readTaskId(submitJson);

  if (!taskId) {
    throw new Error(
      'Alibaba Cloud task submit response is missing output.task_id.',
    );
  }

  const metadata = createAlibabaCloudMetadata({
    modelConfig,
    params,
    request,
    resumed: false,
    route,
    taskId,
  });

  await options?.onStarted?.(metadata);

  const polled = await pollAlibabaCloudTask(taskId, apiKey);
  const remoteUrl = firstAlibabaCloudOutput(polled);

  return {
    providerId: ALIBABACLOUD_PROVIDER_ID,
    remoteUrl,
    contentType: modelConfig.outputContentType,
    metadata: {
      ...metadata,
      alibabacloud_remote_url: remoteUrl,
      alibabacloud_status: polled.output?.task_status ?? null,
    },
  };
}

async function generateSync({
  apiKey,
  modelConfig,
  options,
  params,
  request,
  route,
}: {
  apiKey: string;
  modelConfig: AlibabaCloudModelConfig;
  options: Parameters<InferenceProvider['generate']>[1];
  params: AlibabaCloudRequestParams;
  request: InferenceRequest;
  route: AlibabaCloudRoute;
}): Promise<InferenceResult> {
  await options?.onPreSubmit?.({
    sherin_model_id: request.model,
    sherin_provider: ALIBABACLOUD_PROVIDER_ID,
    sherin_stage: 'provider_submitting',
    alibabacloud_endpoint: route.path,
    alibabacloud_model: modelConfig.providerModel,
  });

  const submitResponse = await fetch(`${ALIBABACLOUD_BASE_URL}${route.path}`, {
    method: 'POST',
    headers: alibabaCloudHeaders(apiKey, false),
    body: JSON.stringify(
      buildAlibabaCloudRequestBody(request, modelConfig, route, params),
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!submitResponse.ok) {
    throw await buildAlibabaCloudHttpError(
      'Alibaba Cloud request',
      submitResponse,
    );
  }

  const submitJson = (await submitResponse.json()) as AlibabaCloudTaskResponse;
  const remoteUrl = firstAlibabaCloudOutput(submitJson);
  const metadata = createAlibabaCloudMetadata({
    modelConfig,
    params,
    request,
    resumed: false,
    route,
    taskId:
      typeof submitJson.request_id === 'string' ? submitJson.request_id : null,
  });

  await options?.onStarted?.(metadata);

  return {
    providerId: ALIBABACLOUD_PROVIDER_ID,
    remoteUrl,
    contentType: modelConfig.outputContentType,
    metadata: {
      ...metadata,
      alibabacloud_remote_url: remoteUrl,
      alibabacloud_status: 'SUCCEEDED',
    },
  };
}

function routeForAlibabaCloudModel(
  config: AlibabaCloudModelConfig,
): AlibabaCloudRoute {
  const model = config.providerModel;

  if (config.kind === 'image') {
    if (MULTIMODAL_SYNC_IMAGE_MODELS.has(model)) {
      return {
        async: false,
        kind: 'sync_image',
        path: '/api/v1/services/aigc/multimodal-generation/generation',
        protocol: 'multimodal',
      };
    }

    if (ASYNC_IMAGE_TO_IMAGE_MODELS.has(model)) {
      return {
        async: true,
        kind: 'image_task',
        path: '/api/v1/services/aigc/image2image/image-synthesis',
        protocol: 'image_task',
      };
    }
  }

  if (config.kind === 'video' && ANIMATE_IMAGE_TO_VIDEO_MODELS.has(model)) {
    return {
      async: true,
      kind: 'video_task',
      path: '/api/v1/services/aigc/image2video/video-synthesis',
      protocol: 'animate_image_to_video',
    };
  }

  if (config.kind === 'video' && VIDEO_GENERATION_MODELS.has(model)) {
    return {
      async: true,
      kind: 'video_task',
      path: '/api/v1/services/aigc/video-generation/video-synthesis',
      protocol: 'video',
    };
  }

  throw new Error(
    `Alibaba Cloud model "${model}" is not valid for a ${config.kind} step.`,
  );
}

function buildAlibabaCloudRequestBody(
  request: InferenceRequest,
  config: AlibabaCloudModelConfig,
  route: AlibabaCloudRoute,
  params: AlibabaCloudRequestParams,
): AlibabaCloudJsonObject {
  const input: AlibabaCloudJsonObject = {};
  const parameters: AlibabaCloudJsonObject = {};
  const prompt = request.prompt.trim().length > 0 ? request.prompt : null;
  const imageFiles = request.inputFiles;
  const videoFiles = params.videoInputFiles;

  if (route.protocol === 'multimodal') {
    mergeMultimodalInput(input, prompt, imageFiles);
  } else if (route.protocol === 'video') {
    mergeVideoInput({
      input,
      lastFrameFiles: params.lastFrameFiles,
      model: config.providerModel,
      negativePrompt: params.negativePrompt ?? null,
      prompt,
      imageFiles,
      videoFiles,
    });
  } else if (route.protocol === 'animate_image_to_video') {
    if (imageFiles[0]) {
      input.image_url = imageFiles[0];
    }

    const animateVideo = videoFiles[0] ?? imageFiles[1];

    if (animateVideo) {
      input.video_url = animateVideo;
    }
  } else {
    mergeImageTaskInput({ config, input, params, prompt, imageFiles });
  }

  mergeCommonParameters({ config, parameters, params, request, route });

  return compactJsonObject({
    model: config.providerModel,
    input,
    parameters,
  });
}

function mergeMultimodalInput(
  input: AlibabaCloudJsonObject,
  prompt: string | null,
  imageFiles: string[],
) {
  const content: AlibabaCloudJsonObject[] = [];

  if (prompt) {
    content.push({ text: prompt });
  }

  for (const file of imageFiles) {
    content.push({ image: file });
  }

  input.messages = [{ role: 'user', content }];
}

function mergeImageTaskInput({
  config,
  input,
  params,
  prompt,
  imageFiles,
}: {
  config: AlibabaCloudModelConfig;
  input: AlibabaCloudJsonObject;
  params: AlibabaCloudRequestParams;
  prompt: string | null;
  imageFiles: string[];
}) {
  if (config.providerModel === 'wanx2.1-imageedit') {
    if (imageFiles[0]) {
      input.base_image_url = imageFiles[0];
    }

    if (params.mask) {
      input.mask_image_url = params.mask;
    }

    input.function = params.editFunction ?? 'description_edit';

    if (prompt) {
      input.prompt = prompt;
    }

    return;
  }

  if (prompt) {
    input.prompt = prompt;
  }

  if (params.negativePrompt) {
    input.negative_prompt = params.negativePrompt;
  }

  if (imageFiles.length > 0) {
    input.images = imageFiles;
  }
}

function mergeVideoInput({
  input,
  lastFrameFiles,
  model,
  negativePrompt,
  prompt,
  imageFiles,
  videoFiles,
}: {
  input: AlibabaCloudJsonObject;
  lastFrameFiles: string[];
  model: string;
  negativePrompt: string | null;
  prompt: string | null;
  imageFiles: string[];
  videoFiles: string[];
}) {
  if (prompt) {
    input.prompt = prompt;
  }

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  const media: AlibabaCloudJsonObject[] = [];

  if (isVideoEditModel(model)) {
    if (videoFiles[0]) {
      media.push({ type: 'video', url: videoFiles[0] });
    }

    for (const file of imageFiles) {
      media.push({ type: 'reference_image', url: file });
    }
  } else if (model.includes('r2v')) {
    for (const file of imageFiles) {
      media.push({ type: 'reference_image', url: file });
    }

    for (const file of videoFiles) {
      media.push({ type: 'reference_video', url: file });
    }
  } else {
    if (imageFiles[0]) {
      media.push({ type: 'first_frame', url: imageFiles[0] });
    }

    for (const file of imageFiles.slice(1)) {
      media.push({ type: 'reference_image', url: file });
    }
  }

  for (const file of lastFrameFiles) {
    media.push({ type: 'last_frame', url: file });
  }

  if (media.length > 0) {
    input.media = media;
  }
}

function mergeCommonParameters({
  config,
  parameters,
  params,
  request,
  route,
}: {
  config: AlibabaCloudModelConfig;
  parameters: AlibabaCloudJsonObject;
  params: AlibabaCloudRequestParams;
  request: InferenceRequest;
  route: AlibabaCloudRoute;
}) {
  if (route.protocol === 'animate_image_to_video') {
    setIfDefined(parameters, 'check_image', params.checkImage);
    setIfDefined(parameters, 'mode', params.mode);
    pruneUnsupportedParameters(parameters, ANIMATE_PARAMETER_KEYS);
    return;
  }

  const videoKeys =
    route.protocol === 'video'
      ? new Set(VIDEO_PARAMETER_KEYS_BY_MODEL[config.providerModel] ?? [])
      : null;

  if (
    route.protocol !== 'video' &&
    hasSchemaField(config, 'generation_output_number')
  ) {
    parameters.n = clampOutputNumber(request.outputNumber, config);
  }

  setIfSupported(parameters, videoKeys, 'duration', params.duration);
  setIfSupported(parameters, videoKeys, 'prompt_extend', params.promptExtend);
  setIfSupported(parameters, videoKeys, 'watermark', params.watermark);
  setIfSupported(parameters, videoKeys, 'seed', params.seed);
  setIfSupported(parameters, videoKeys, 'audio_setting', params.audioSetting);

  if (
    route.protocol === 'multimodal' &&
    hasSchemaField(config, 'generation_negative_prompt') &&
    params.negativePrompt
  ) {
    parameters.negative_prompt = params.negativePrompt;
  }

  if (
    route.protocol !== 'video' &&
    hasSchemaField(config, 'generation_size') &&
    request.ratio
  ) {
    parameters.size = normalizeSize(request.ratio);
  }

  if (route.protocol === 'video') {
    setIfSupported(
      parameters,
      videoKeys,
      'resolution',
      normalizeResolution(request.resolution),
    );
    setIfSupported(parameters, videoKeys, 'ratio', request.ratio || undefined);
  }
}

function createAlibabaCloudSemanticParams(
  request: InferenceRequest,
  config: AlibabaCloudModelConfig,
  params: AlibabaCloudRequestParams,
) {
  const semanticParams: Record<string, unknown> = {};

  if (config.promptSupported && request.prompt.trim().length > 0) {
    semanticParams.generation_prompt = request.prompt;
  }

  if (hasSchemaField(config, 'generation_size') && request.ratio) {
    semanticParams.generation_size = normalizeSize(request.ratio);
  }

  if (hasSchemaField(config, 'generation_aspect_ratio') && request.ratio) {
    semanticParams.generation_aspect_ratio = request.ratio;
  }

  if (hasSchemaField(config, 'generation_resolution') && request.resolution) {
    semanticParams.generation_resolution = request.resolution;
  }

  if (
    hasSchemaField(config, 'generation_duration') &&
    params.duration !== undefined
  ) {
    semanticParams.generation_duration = params.duration;
  }

  if (hasSchemaField(config, 'generation_seed') && params.seed !== undefined) {
    semanticParams.generation_seed = params.seed;
  }

  if (
    hasSchemaField(config, 'generation_negative_prompt') &&
    params.negativePrompt
  ) {
    semanticParams.generation_negative_prompt = params.negativePrompt;
  }

  if (
    hasSchemaField(config, 'generation_watermark') &&
    params.watermark !== undefined
  ) {
    semanticParams.generation_watermark = params.watermark;
  }

  if (
    hasSchemaField(config, 'generation_prompt_extend') &&
    params.promptExtend !== undefined
  ) {
    semanticParams.generation_prompt_extend = params.promptExtend;
  }

  if (hasSchemaField(config, 'generation_mode') && params.mode) {
    semanticParams.generation_mode = params.mode;
  }

  if (
    hasSchemaField(config, 'generation_check_image') &&
    params.checkImage !== undefined
  ) {
    semanticParams.generation_check_image = params.checkImage;
  }

  if (hasSchemaField(config, 'generation_audio') && params.audioSetting) {
    semanticParams.generation_audio = params.audioSetting;
  }

  if (
    hasSchemaField(config, 'generation_input_image_file') &&
    request.inputFiles.length > 0
  ) {
    semanticParams.generation_input_image_file = request.inputFiles;
  }

  if (
    hasSchemaField(config, 'generation_input_video_file') &&
    params.videoInputFiles.length > 0
  ) {
    semanticParams.generation_input_video_file = params.videoInputFiles;
  }

  return semanticParams;
}

function assertAlibabaCloudRequestMatchesModelConfig(
  request: InferenceRequest,
  config: AlibabaCloudModelConfig,
  params: AlibabaCloudRequestParams,
) {
  if (!config.outputFormats.includes(request.outputFormat as never)) {
    throw new Error(
      `Alibaba Cloud model ${request.model} does not support output format ${request.outputFormat}.`,
    );
  }

  if (
    config.kind === 'video' &&
    config.ratios.length > 0 &&
    !config.ratios.includes(request.ratio)
  ) {
    throw new Error(
      `Alibaba Cloud model ${request.model} does not support aspect ratio ${request.ratio}.`,
    );
  }

  if (
    config.resolutions.length > 0 &&
    request.resolution &&
    !config.resolutions.includes(request.resolution)
  ) {
    throw new Error(
      `Alibaba Cloud model ${request.model} does not support resolution ${request.resolution}.`,
    );
  }

  if (request.inputFiles.length > config.inputImageLimit) {
    throw new Error(
      `Alibaba Cloud model ${request.model} supports at most ${config.inputImageLimit} input image URLs.`,
    );
  }

  if (config.requiresImageInput && request.inputFiles.length === 0) {
    throw new Error(
      `Alibaba Cloud model ${request.model} requires an input image URL.`,
    );
  }

  if (!config.supportsImageInput && request.inputFiles.length > 0) {
    throw new Error(
      `Alibaba Cloud model ${request.model} does not support input images.`,
    );
  }

  if (params.videoInputFiles.length > config.inputVideoLimit) {
    throw new Error(
      `Alibaba Cloud model ${request.model} supports at most ${config.inputVideoLimit} input video URLs.`,
    );
  }

  if (config.requiresVideoInput && params.videoInputFiles.length === 0) {
    throw new Error(
      `Alibaba Cloud model ${request.model} requires an input video URL.`,
    );
  }

  if (!config.supportsVideoInput && params.videoInputFiles.length > 0) {
    throw new Error(
      `Alibaba Cloud model ${request.model} does not support input videos.`,
    );
  }

  if (params.duration !== undefined && config.duration) {
    if (
      !Number.isInteger(params.duration) ||
      params.duration < config.duration.min ||
      params.duration > config.duration.max
    ) {
      throw new Error(
        `Alibaba Cloud model ${request.model} supports duration ${config.duration.min}-${config.duration.max} seconds.`,
      );
    }
  }

  if (params.seed !== undefined && config.seed) {
    if (
      !Number.isInteger(params.seed) ||
      params.seed < config.seed.min ||
      params.seed > config.seed.max
    ) {
      throw new Error(
        `Alibaba Cloud model ${request.model} supports seed ${config.seed.min}-${config.seed.max}.`,
      );
    }
  }
}

function readAlibabaCloudParamsFromFormData(
  formData: FormData,
  config: AlibabaCloudModelConfig,
): InferenceByokParams {
  const params: InferenceByokParams = {};

  assignNumberField(formData, config, params, 'generation_duration');
  assignNumberField(formData, config, params, 'generation_seed');
  assignNumberField(formData, config, params, 'generation_output_number');
  assignBooleanField(formData, config, params, 'generation_watermark');
  assignBooleanField(formData, config, params, 'generation_prompt_extend');
  assignBooleanField(formData, config, params, 'generation_check_image');
  assignStringField(formData, config, params, 'generation_negative_prompt');
  assignStringField(formData, config, params, 'generation_mode');
  assignStringField(formData, config, params, 'generation_audio');
  assignStringField(formData, config, params, 'generation_function');
  assignStringField(formData, config, params, 'generation_mask');

  if (hasSchemaField(config, 'generation_input_video_file')) {
    const videoInputFiles =
      formData.get('generation_input_video_file_source') === 'upload'
        ? []
        : parseInputUrls(formData.get('generation_input_video_file'));

    if (videoInputFiles.length > 0) {
      params.generation_input_video_file = videoInputFiles;
    }
  }

  if (hasSchemaField(config, 'generation_last_frame')) {
    const lastFrameFiles = parseInputUrls(
      formData.get('generation_last_frame'),
    );

    if (lastFrameFiles.length > 0) {
      params.generation_last_frame = lastFrameFiles;
    }
  }

  return params;
}

function mergeAlibabaCloudPreflightParams(
  formParams: InferenceByokParams,
  requestParams: InferenceByokParams,
  config: AlibabaCloudModelConfig,
): InferenceByokParams {
  if (!hasSchemaField(config, 'generation_input_video_file')) {
    const { generation_input_video_file: _ignored, ...params } = formParams;

    return params;
  }

  const requestVideoInputFiles = collectStringValues(
    requestParams.generation_input_video_file,
  );

  if (requestVideoInputFiles.length > 0) {
    return {
      ...formParams,
      generation_input_video_file: requestVideoInputFiles,
    };
  }

  const formVideoInputFiles = collectStringValues(
    formParams.generation_input_video_file,
  );

  if (formVideoInputFiles.length > 0) {
    return formParams;
  }

  const { generation_input_video_file: _unused, ...params } = formParams;

  return params;
}

function resolveAlibabaCloudParams(
  params: InferenceByokParams,
  config: AlibabaCloudModelConfig,
): AlibabaCloudRequestParams {
  return {
    audioSetting: hasSchemaField(config, 'generation_audio')
      ? readOptionalString(params.generation_audio)
      : undefined,
    checkImage: hasSchemaField(config, 'generation_check_image')
      ? readOptionalBoolean(params.generation_check_image)
      : undefined,
    duration: hasSchemaField(config, 'generation_duration')
      ? (readOptionalNumber(params.generation_duration) ??
        (config.duration?.required ? config.duration.defaultValue : undefined))
      : undefined,
    editFunction: hasSchemaField(config, 'generation_function')
      ? readOptionalString(params.generation_function)
      : undefined,
    mask: hasSchemaField(config, 'generation_mask')
      ? readOptionalString(params.generation_mask)
      : undefined,
    mode: hasSchemaField(config, 'generation_mode')
      ? readOptionalString(params.generation_mode)
      : undefined,
    negativePrompt: hasSchemaField(config, 'generation_negative_prompt')
      ? readOptionalString(params.generation_negative_prompt)
      : undefined,
    promptExtend: hasSchemaField(config, 'generation_prompt_extend')
      ? readOptionalBoolean(params.generation_prompt_extend)
      : undefined,
    seed: hasSchemaField(config, 'generation_seed')
      ? readOptionalNumber(params.generation_seed)
      : undefined,
    watermark: hasSchemaField(config, 'generation_watermark')
      ? readOptionalBoolean(params.generation_watermark)
      : undefined,
    videoInputFiles: hasSchemaField(config, 'generation_input_video_file')
      ? collectStringValues(params.generation_input_video_file)
      : [],
    lastFrameFiles: hasSchemaField(config, 'generation_last_frame')
      ? collectStringValues(params.generation_last_frame)
      : [],
  };
}

async function pollAlibabaCloudTask(taskId: string, apiKey: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = 'PENDING';

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(
      `${ALIBABACLOUD_BASE_URL}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: alibabaCloudAuthHeaders(apiKey),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw await buildAlibabaCloudHttpError('Alibaba Cloud polling', response);
    }

    const json = (await response.json()) as AlibabaCloudTaskResponse;
    lastStatus = json.output?.task_status ?? lastStatus;
    const normalizedStatus = lastStatus.toUpperCase();

    if (normalizedStatus === 'SUCCEEDED') {
      return json;
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'UNKNOWN') {
      throw new Error(
        `Alibaba Cloud generation failed: ${json.output?.message ?? normalizedStatus} (${json.output?.code ?? 'provider_failed'}).`,
      );
    }

    if (normalizedStatus === 'CANCELED') {
      throw new Error('Alibaba Cloud generation was canceled.');
    }
  }

  throw buildAlibabaCloudPollTimeoutError(lastStatus);
}

function firstAlibabaCloudOutput(response: AlibabaCloudTaskResponse) {
  const remoteUrl = collectOutputUrls(response)[0];

  if (!remoteUrl || !remoteUrl.startsWith('https://')) {
    throw new Error('Alibaba Cloud returned no HTTPS output URL.');
  }

  return remoteUrl;
}

function collectOutputUrls(payload: AlibabaCloudTaskResponse) {
  const output = payload.output;
  const urls: string[] = [];

  if (!output) {
    return urls;
  }

  for (const value of [output.image_url, output.video_url]) {
    if (isNonEmptyString(value)) {
      urls.push(value);
    }
  }

  for (const choice of output.choices ?? []) {
    for (const item of choice.message?.content ?? []) {
      for (const value of [item.image, item.video_url, item.url]) {
        if (isNonEmptyString(value)) {
          urls.push(value);
        }
      }
    }
  }

  for (const result of output.results ?? []) {
    for (const value of [result.url, result.image_url, result.video_url]) {
      if (isNonEmptyString(value)) {
        urls.push(value);
      }
    }
  }

  return [...new Set(urls)];
}

function readTaskId(payload: AlibabaCloudTaskResponse) {
  const taskId = payload.output?.task_id;

  return isNonEmptyString(taskId) ? taskId : null;
}

function createAlibabaCloudMetadata({
  modelConfig,
  params,
  request,
  resumed,
  route,
  taskId,
}: {
  modelConfig: AlibabaCloudModelConfig;
  params: AlibabaCloudRequestParams;
  request: InferenceRequest;
  resumed: boolean;
  route: AlibabaCloudRoute;
  taskId: string | null;
}) {
  return {
    sherin_model_id: request.model,
    sherin_stage: 'inference_started',
    alibabacloud_aspect_ratio: request.ratio || null,
    alibabacloud_resolution: request.resolution ?? null,
    alibabacloud_duration: params.duration ?? null,
    alibabacloud_endpoint: route.path,
    alibabacloud_input_file_count: request.inputFiles.length,
    alibabacloud_kind: route.kind,
    alibabacloud_model: modelConfig.providerModel,
    alibabacloud_output_format: request.outputFormat,
    alibabacloud_protocol: route.protocol,
    alibabacloud_seed: params.seed ?? null,
    alibabacloud_task_id: taskId,
    alibabacloud_video_input_file_count: params.videoInputFiles.length,
    ...(resumed ? { alibabacloud_resumed: true } : {}),
  };
}

function alibabaCloudHeaders(apiKey: string, async: boolean) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };

  if (async) {
    headers['x-dashscope-async'] = 'enable';
  }

  return headers;
}

function alibabaCloudAuthHeaders(apiKey: string) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
}

async function buildAlibabaCloudHttpError(label: string, response: Response) {
  const body = await safeText(response);
  const error = new Error(
    `${label} failed (${response.status}): ${body}`,
  ) as Error & {
    statusCode?: number;
    retryAfterSeconds?: number | null;
    isTransient?: boolean;
  };
  error.statusCode = response.status;
  error.retryAfterSeconds = parseRetryAfter(
    response.headers.get('retry-after'),
  );
  error.isTransient =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    (response.status >= 500 && response.status < 600);
  return error;
}

function buildAlibabaCloudPollTimeoutError(lastStatus: string) {
  const error = new Error(
    `Alibaba Cloud generation timed out within this worker invocation (last status: ${lastStatus}).`,
  );
  error.name = 'TimeoutError';
  return error;
}

function readAlibabaCloudApiKey() {
  return getOptionalEnv('DASHSCOPE_API_KEY');
}

function requireAlibabaCloudApiKey() {
  const apiKey = readAlibabaCloudApiKey();

  if (!apiKey) {
    throw new Error(
      'DASHSCOPE_API_KEY is required for Alibaba Cloud inference.',
    );
  }

  return apiKey;
}

function clampRatio(ratio: string, config: AlibabaCloudModelConfig) {
  if (config.ratios.length === 0) {
    return config.defaultRatio;
  }

  return config.ratios.includes(ratio) ? ratio : config.defaultRatio;
}

function clampResolution(
  resolution: string | undefined,
  config: AlibabaCloudModelConfig,
) {
  if (config.resolutions.length === 0) {
    return undefined;
  }

  return resolution && config.resolutions.includes(resolution)
    ? resolution
    : config.defaultResolution;
}

function clampOutputNumber(value: number, config: AlibabaCloudModelConfig) {
  const field = config.schema.find(
    (candidate) => candidate.name === 'generation_output_number',
  );
  const min = typeof field?.min === 'number' ? field.min : 1;
  const max = typeof field?.max === 'number' ? field.max : 1;

  if (!Number.isInteger(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function hasSchemaField(config: AlibabaCloudModelConfig, name: string) {
  return config.schema.some((field) => field.name === name);
}

function assignNumberField(
  formData: FormData,
  config: AlibabaCloudModelConfig,
  params: InferenceByokParams,
  key: string,
) {
  if (!hasSchemaField(config, key)) {
    return;
  }

  const value = readOptionalNumber(formData.get(key));

  if (value !== undefined) {
    params[key] = value;
  }
}

function assignBooleanField(
  formData: FormData,
  config: AlibabaCloudModelConfig,
  params: InferenceByokParams,
  key: string,
) {
  if (!hasSchemaField(config, key)) {
    return;
  }

  const value = readOptionalBoolean(formData.get(key));

  if (value !== undefined) {
    params[key] = value;
  }
}

function assignStringField(
  formData: FormData,
  config: AlibabaCloudModelConfig,
  params: InferenceByokParams,
  key: string,
) {
  if (!hasSchemaField(config, key)) {
    return;
  }

  const value = readOptionalString(formData.get(key));

  if (value !== undefined) {
    params[key] = value;
  }
}

function pruneUnsupportedParameters(
  parameters: AlibabaCloudJsonObject,
  supportedKeys: ReadonlySet<string>,
) {
  for (const key of Object.keys(parameters)) {
    if (!supportedKeys.has(key)) {
      delete parameters[key];
    }
  }
}

function setIfSupported(
  target: AlibabaCloudJsonObject,
  supportedKeys: ReadonlySet<string> | null,
  key: string,
  value: unknown,
) {
  if (supportedKeys && !supportedKeys.has(key)) {
    return;
  }

  setIfDefined(target, key, value);
}

function setIfDefined(
  target: AlibabaCloudJsonObject,
  key: string,
  value: unknown,
) {
  if (value === undefined || value === null) {
    return;
  }

  target[key] = value;
}

function compactJsonObject(
  value: Record<string, unknown>,
): AlibabaCloudJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function normalizeResolution(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const upper = value.trim().toUpperCase();

  return upper.endsWith('P') ? upper : value;
}

function normalizeSize(value: string) {
  return value.replace(/x/i, '*');
}

function isVideoEditModel(model: string) {
  return model === 'happyhorse-1.0-video-edit' || model === 'wan2.7-videoedit';
}

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseInputUrls(value: unknown) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      if (!isHttpsUrl(url)) {
        throw new Error('Alibaba Cloud input URLs must use HTTPS.');
      }

      return url;
    });
}

function collectStringValues(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), 600);
  }

  const dateMs = Date.parse(value);

  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(600, Math.ceil((dateMs - Date.now()) / 1000)));
  }

  return null;
}

async function safeText(response: Response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
