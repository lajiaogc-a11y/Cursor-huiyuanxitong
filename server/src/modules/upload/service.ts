/**
 * Upload Service — 图片上传/读取业务逻辑封装
 */
import { randomUUID } from 'crypto';
import { config } from '../../config/index.js';
import {
  type UploadedImageRow,
  selectUploadedImageById,
  insertUploadedImageS3Row,
  insertUploadedImageMysqlRow,
} from './repository.js';
import { ensureWebpForReadResponse, transcodeToWebp } from '../../lib/uploadImageWebp.js';
import {
  buildS3ObjectKey,
  getPresignedGetUrl,
  getWebpImageBuffer,
  putWebpImage,
} from '../../services/s3ImageStorage.js';

export type { UploadedImageRow };

export function toWebpFileName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) : '';
  const base = s && !s.endsWith('.') ? s.replace(/\.(webp|jpg|jpeg|png|gif|bmp|svg)$/i, '') : 'image';
  return `${base || 'image'}.webp`;
}

export function isPrivateVisibility(row: UploadedImageRow): boolean {
  return (row.visibility || 'public').toLowerCase() === 'private';
}

export async function loadImagePayload(row: UploadedImageRow): Promise<{ buffer: Buffer; contentType: string }> {
  const backend = (row.storage_backend || 'mysql').toLowerCase();
  if (backend === 's3' && row.s3_key) {
    if (!config.s3.enabled) {
      const err = new Error('S3 object referenced but S3 is not configured on this server');
      (err as Error & { statusCode?: number }).statusCode = 503;
      throw err;
    }
    return getWebpImageBuffer(row.s3_key);
  }
  if (row.data && row.data.length > 0) {
    return { buffer: row.data, contentType: row.content_type || 'image/webp' };
  }
  const err = new Error('Image payload empty');
  (err as Error & { statusCode?: number }).statusCode = 404;
  throw err;
}

export async function getImageRowService(id: string): Promise<UploadedImageRow | null> {
  return selectUploadedImageById(id);
}

export async function getPresignUrlService(row: UploadedImageRow): Promise<string | null> {
  const backend = (row.storage_backend || 'mysql').toLowerCase();
  if (backend === 's3' && row.s3_key && config.s3.enabled) {
    return getPresignedGetUrl(row.s3_key, config.s3.presignExpiresSec);
  }
  return null;
}

export async function uploadImageService(params: {
  base64Data: string;
  fileName: unknown;
  tenantId: string | null;
  createdBy: string;
  isAdmin: boolean;
}): Promise<{ id: string; visibility: 'public' | 'private'; storage: string }> {
  const base64 = params.base64Data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) {
    const err = new Error('empty image buffer');
    (err as Error & { code?: string }).code = 'MISSING_DATA';
    throw err;
  }
  const maxIn = config.upload.maxInputBytes;
  if (buf.length > maxIn) {
    const err = new Error(`Decoded image exceeds ${maxIn} bytes`);
    (err as Error & { code?: string }).code = 'FILE_TOO_LARGE';
    throw err;
  }

  const visibility: 'public' | 'private' = params.tenantId ? 'public' : 'private';
  const webpBuf = await transcodeToWebp(buf);
  const id = randomUUID();
  const outName = toWebpFileName(params.fileName);

  if (config.s3.enabled) {
    const s3Key = buildS3ObjectKey(id, visibility);
    await putWebpImage({ key: s3Key, body: webpBuf });
    await insertUploadedImageS3Row({
      id,
      tenantId: params.tenantId,
      fileName: outName,
      sizeBytes: webpBuf.length,
      createdBy: params.createdBy,
      s3Key,
      visibility,
    });
    return { id, visibility, storage: 's3' };
  } else {
    await insertUploadedImageMysqlRow({
      id,
      tenantId: params.tenantId,
      webpBuf,
      fileName: outName,
      sizeBytes: webpBuf.length,
      createdBy: params.createdBy,
      visibility,
    });
    return { id, visibility, storage: 'mysql' };
  }
}

export async function readImagePayloadService(
  row: UploadedImageRow,
): Promise<{ buffer: Buffer; contentType: string }> {
  const loaded = await loadImagePayload(row);
  return ensureWebpForReadResponse(loaded.buffer, loaded.contentType);
}
