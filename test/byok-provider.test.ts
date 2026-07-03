import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAlibabaCloudProvider,
  isAlibabaCloudConfigured,
} from '@/lib/inference/alibaba-cloud/server-actions';
import type {
  InferenceProvider,
  InferenceRequest,
} from '@/lib/inference/types';

const ALIBABACLOUD_BASE_URL = 'https://dashscope-intl.aliyuncs.com';

describe('Alibaba Cloud provider', () => {
  beforeEach(() => {
    process.env.DASHSCOPE_API_KEY = 'dashscope_test_key';
    delete process.env.INFERENCE_POLL_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('submits synchronous multimodal image generations', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        output: {
          choices: [
            {
              message: {
                content: [
                  { image: 'https://dashscope-result.aliyuncs.com/out.png' },
                ],
              },
            },
          ],
        },
        request_id: 'req_image',
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const result = await createAlibabaCloudProvider().generate(
      createRequest({
        model: 'qwen/image',
        outputFormat: 'png',
        ratio: '1664*928',
      }),
    );

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;

    expect(submitUrl).toBe(
      `${ALIBABACLOUD_BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`,
    );
    expect(submitInit.method).toBe('POST');
    expect(submitInit.headers).toMatchObject({
      authorization: 'Bearer dashscope_test_key',
    });
    expect(submitInit.headers).not.toHaveProperty('x-dashscope-async');
    expect(submitBody).toMatchObject({
      model: 'qwen-image',
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: 'A clean regression generation' }],
          },
        ],
      },
      parameters: { n: 1, size: '1664*928' },
    });
    expect(result).toMatchObject({
      contentType: 'image/png',
      providerId: 'alibaba-cloud',
      remoteUrl: 'https://dashscope-result.aliyuncs.com/out.png',
    });
  });

  it('sends input images as multimodal content for edit models', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        output: {
          choices: [
            {
              message: {
                content: [
                  { image: 'https://dashscope-result.aliyuncs.com/edit.png' },
                ],
              },
            },
          ],
        },
        request_id: 'req_edit',
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await createAlibabaCloudProvider().generate(
      createRequest({
        inputFiles: ['https://assets.example.com/source.png'],
        model: 'qwen/image-edit',
        outputFormat: 'png',
        ratio: '1024*1024',
      }),
    );

    const [, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const submitBody = JSON.parse(String(submitInit.body)) as {
      input: { messages: Array<{ content: Array<Record<string, string>> }> };
    };

    expect(submitBody.input.messages[0]?.content).toEqual([
      { text: 'A clean regression generation' },
      { image: 'https://assets.example.com/source.png' },
    ]);
  });

  it('submits asynchronous video tasks and polls for completion', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          output: { task_id: 'task_video', task_status: 'PENDING' },
          request_id: 'req_video',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_id: 'task_video',
            task_status: 'SUCCEEDED',
            video_url: 'https://dashscope-result.aliyuncs.com/out.mp4',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createAlibabaCloudProvider().generate(
      createRequest({
        model: 'wan/2.7-t2v',
        outputFormat: 'mp4',
        ratio: '16:9',
        resolution: '1080P',
      }),
    );

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await generationPromise;

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const submitBody = JSON.parse(String(submitInit.body)) as Record<
      string,
      unknown
    >;
    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];

    expect(submitUrl).toBe(
      `${ALIBABACLOUD_BASE_URL}/api/v1/services/aigc/video-generation/video-synthesis`,
    );
    expect(submitInit.headers).toMatchObject({
      authorization: 'Bearer dashscope_test_key',
      'x-dashscope-async': 'enable',
    });
    expect(submitBody).toMatchObject({
      model: 'wan2.7-t2v',
      input: { prompt: 'A clean regression generation' },
      parameters: { ratio: '16:9', resolution: '1080P' },
    });
    expect(pollUrl).toBe(`${ALIBABACLOUD_BASE_URL}/api/v1/tasks/task_video`);
    expect(pollInit.method).toBe('GET');
    expect(result).toMatchObject({
      contentType: 'video/mp4',
      providerId: 'alibaba-cloud',
      remoteUrl: 'https://dashscope-result.aliyuncs.com/out.mp4',
    });
  });

  it('resumes polling without resubmitting async work', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        output: {
          task_id: 'task_resume',
          task_status: 'SUCCEEDED',
          video_url: 'https://dashscope-result.aliyuncs.com/resumed.mp4',
        },
      }),
    );
    const onPreSubmit = vi.fn();
    const onStarted = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const generationPromise = createAlibabaCloudProvider().generate(
      createRequest({
        model: 'wan/2.7-t2v',
        outputFormat: 'mp4',
        ratio: '16:9',
        resolution: '1080P',
      }),
      { onPreSubmit, onStarted, providerGenerationId: 'task_resume' },
    );

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await generationPromise;
    const [pollUrl, pollInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pollUrl).toBe(`${ALIBABACLOUD_BASE_URL}/api/v1/tasks/task_resume`);
    expect(pollInit.method).toBe('GET');
    expect(onPreSubmit).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        alibabacloud_resumed: true,
        alibabacloud_task_id: 'task_resume',
      }),
    );
    expect(result.remoteUrl).toBe(
      'https://dashscope-result.aliyuncs.com/resumed.mp4',
    );
  });

  it('prepares Semantic Lady params from form data', async () => {
    const formData = new FormData();

    formData.set('generation_seed', '321');
    formData.set('generation_negative_prompt', 'blurry');

    await expect(
      prepareRequest(
        createAlibabaCloudProvider(),
        formData,
        createRequest({ model: 'qwen/image' }),
      ),
    ).resolves.toMatchObject({
      inputImageLimit: 0,
      inputVideoLimit: 0,
      request: {
        byokParams: {
          generation_negative_prompt: 'blurry',
          generation_seed: 321,
        },
      },
    });
  });

  it('rejects models that require an input image before submit', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      createAlibabaCloudProvider().generate(
        createRequest({ model: 'qwen/image-edit', ratio: '1024*1024' }),
      ),
    ).rejects.toThrow('generation_input_image_file is required');
  });

  it('detects Alibaba Cloud API keys', () => {
    expect(isAlibabaCloudConfigured()).toBe(true);
  });
});

function createRequest(
  overrides: Partial<InferenceRequest> = {},
): InferenceRequest {
  return {
    babyseaSpecificParams: {},
    byokParams: {},
    inputFiles: [],
    model: 'qwen/image',
    outputFormat: 'png',
    outputNumber: 1,
    prompt: 'A clean regression generation',
    providerOrder: 'fastest',
    ratio: '1664*928',
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

async function prepareRequest(
  provider: InferenceProvider,
  formData: FormData,
  request: InferenceRequest,
) {
  if (!provider.prepareRequest) {
    throw new Error('Alibaba Cloud provider does not expose prepareRequest.');
  }

  return await provider.prepareRequest({ formData, request });
}
