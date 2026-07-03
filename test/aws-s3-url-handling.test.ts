import { describe, expect, it } from 'vitest';

import { resolveAwsS3EndpointConfig } from '@/lib/storage/aws-s3/server-actions';

const baseInput = {
  bucket: 'your-bucket-name',
  region: 'your-bucket-region',
};

describe('AWS S3 URL handling', () => {
  it('uses bucket-host URLs as public URLs and strips the bucket for SDK writes', () => {
    expect(
      resolveAwsS3EndpointConfig({
        ...baseInput,
        endpointUrl:
          'https://your-bucket-name.s3.your-bucket-region.amazonaws.com',
      }),
    ).toEqual({
      clientEndpoint: 'https://s3.your-bucket-region.amazonaws.com',
      publicBaseUrl:
        'https://your-bucket-name.s3.your-bucket-region.amazonaws.com',
    });
  });

  it('supports path-style bucket URLs', () => {
    expect(
      resolveAwsS3EndpointConfig({
        ...baseInput,
        endpointUrl:
          'https://s3.your-bucket-region.amazonaws.com/your-bucket-name',
      }),
    ).toEqual({
      clientEndpoint: 'https://s3.your-bucket-region.amazonaws.com',
      publicBaseUrl:
        'https://s3.your-bucket-region.amazonaws.com/your-bucket-name',
    });
  });

  it('derives a bucket public URL from a service endpoint', () => {
    expect(
      resolveAwsS3EndpointConfig({
        ...baseInput,
        endpointUrl: 'https://s3.your-bucket-region.amazonaws.com',
      }),
    ).toEqual({
      clientEndpoint: 'https://s3.your-bucket-region.amazonaws.com',
      publicBaseUrl:
        'https://your-bucket-name.s3.your-bucket-region.amazonaws.com',
    });
  });

  it('rejects mismatched bucket paths', () => {
    expect(() =>
      resolveAwsS3EndpointConfig({
        ...baseInput,
        endpointUrl: 'https://s3.your-bucket-region.amazonaws.com/other-bucket',
      }),
    ).toThrow('AWS_S3_ENDPOINT_URL bucket path must match AWS_S3_BUCKET_NAME.');
  });
});
