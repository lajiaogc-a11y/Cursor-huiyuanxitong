/**
 * Amazon S3 storage for uploaded images. Bucket stays private; access is via
 * server-side GetObject (proxy) or short-lived presigned URLs for private assets.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!config.s3.enabled) {
    throw new Error('S3 is not configured (set S3_BUCKET and AWS_REGION or S3_REGION)');
  }
  if (!client) {
    client = new S3Client({ region: config.s3.region });
  }
  return client;
}

/** Opaque key: visibility prefix + uuid + extension — avoids sequential / guessable paths */
export function buildS3ObjectKey(imageId: string, visibility: 'public' | 'private'): string {
  const safeId = imageId.replace(/[^a-f0-9-]/gi, '');
  const prefix = visibility === 'public' ? 'pub' : 'prv';
  return `${prefix}/${safeId}.webp`;
}

export async function putWebpImage(params: {
  key: string;
  body: Buffer;
}): Promise<void> {
  const c = getClient();
  await c.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: 'image/webp',
      /** Bucket remains private; no ACL / public-read */
    }),
  );
}

/** WebP 上限 2MB，整包读入内存可接受；避免流类型在各 Node/SDK 版本差异 */
export async function getWebpImageBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const c = getClient();
  const out = await c.send(
    new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }),
  );
  const body = out.Body;
  if (!body) {
    throw new Error('S3 GetObject returned empty body');
  }
  const bytes = await body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: out.ContentType || 'image/webp',
  };
}

export async function getPresignedGetUrl(key: string, expiresSeconds: number): Promise<string> {
  const c = getClient();
  const cmd = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  return getSignedUrl(c, cmd, { expiresIn: expiresSeconds });
}
