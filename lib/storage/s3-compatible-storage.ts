import 'server-only';

import type {
  StorageProvider,
  StorageProviderId,
  StoreInput,
  StoreResult,
} from './types';

export type S3CompatibleStorageConfig = {
  region: string;
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
};

type ObjectStorageClientModule = {
  DeleteObjectsCommand: new (input: Record<string, unknown>) => unknown;
  S3Client: new (config: Record<string, unknown>) => unknown;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
};

export function createS3CompatibleStorageProvider(input: {
  id: StorageProviderId;
  label: string;
  config: S3CompatibleStorageConfig;
}): StorageProvider {
  const { id, label, config } = input;

  return {
    id,
    label,
    async store(payload: StoreInput): Promise<StoreResult> {
      const { PutObjectCommand: UploadObjectCommand } =
        await loadObjectStorageClient();
      const client = await createObjectStorageClient(config);

      const command = new UploadObjectCommand({
        Bucket: config.bucket,
        Key: payload.key,
        Body: payload.data,
        ContentType: payload.contentType,
      });

      await client.send(command);

      return {
        storagePath: payload.key,
        publicUrl: buildPublicUrl(config, payload.key),
      };
    },
    async remove(storagePaths: string[]) {
      if (storagePaths.length === 0) {
        return;
      }

      const { DeleteObjectsCommand } = await loadObjectStorageClient();
      const client = await createObjectStorageClient(config);

      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: storagePaths.map((storagePath) => ({ Key: storagePath })),
            Quiet: true,
          },
        }),
      );
    },
    async signedUrl(storagePath: string) {
      return buildPublicUrl(config, storagePath);
    },
  };
}

async function createObjectStorageClient(config: S3CompatibleStorageConfig) {
  const { S3Client: StorageClient } = await loadObjectStorageClient();

  return new StorageClient({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }) as { send: (command: unknown) => Promise<unknown> };
}

function buildPublicUrl(config: S3CompatibleStorageConfig, key: string) {
  const base = config.publicBaseUrl.replace(/\/+$/, '');
  const safeKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${base}/${safeKey}`;
}

async function loadObjectStorageClient(): Promise<ObjectStorageClientModule> {
  try {
    return (await import('@aws-sdk/client-s3')) as unknown as ObjectStorageClientModule;
  } catch {
    throw new Error(
      'aws-s3/cloudflare-r2 storage is selected but `@aws-sdk/client-s3` is not installed. Run `pnpm add @aws-sdk/client-s3`.',
    );
  }
}
