/**
 * uploaded_images 数据访问
 */
import { execute, queryOne } from '../../database/index.js';

export interface UploadedImageRow {
  data: Buffer | null;
  content_type: string;
  tenant_id: string | null;
  created_by: string | null;
  storage_backend: string | null;
  s3_key: string | null;
  visibility: string | null;
}

const SELECT_IMAGE_PAYLOAD = `SELECT data, content_type, tenant_id, created_by, storage_backend, s3_key, visibility
     FROM uploaded_images WHERE id = ?`;

const INSERT_IMAGE = `INSERT INTO uploaded_images (id, tenant_id, data, content_type, file_name, size_bytes, created_by, storage_backend, s3_key, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function selectUploadedImageById(id: string): Promise<UploadedImageRow | null> {
  return queryOne<UploadedImageRow>(SELECT_IMAGE_PAYLOAD, [id]);
}

export async function insertUploadedImageS3Row(args: {
  id: string;
  tenantId: string | null;
  fileName: string;
  sizeBytes: number;
  createdBy: string;
  s3Key: string;
  visibility: string;
}): Promise<void> {
  await execute(INSERT_IMAGE, [
    args.id,
    args.tenantId,
    null,
    'image/webp',
    args.fileName,
    args.sizeBytes,
    args.createdBy,
    's3',
    args.s3Key,
    args.visibility,
  ]);
}

export async function insertUploadedImageMysqlRow(args: {
  id: string;
  tenantId: string | null;
  webpBuf: Buffer;
  fileName: string;
  sizeBytes: number;
  createdBy: string;
  visibility: string;
}): Promise<void> {
  await execute(INSERT_IMAGE, [
    args.id,
    args.tenantId,
    args.webpBuf,
    'image/webp',
    args.fileName,
    args.sizeBytes,
    args.createdBy,
    'mysql',
    null,
    args.visibility,
  ]);
}
