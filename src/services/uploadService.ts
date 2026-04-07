import { apiPost } from '@/api/client';
import { compressImageToUploadableFile, type CompressImageOptions } from '@/lib/imageClientCompress';

export interface UploadImageResponse {
  success: boolean;
  url?: string;
  error?: string;
  /** 服务端入库字节恒为 WebP（POST /api/upload/image） */
  mime?: string;
}

/**
 * 以 data URL 提交到 `/api/upload/image`。
 * 服务端会用 Sharp **强制转 WebP** 后存储；`file_name` 仅影响展示名，扩展名会被规范为 `.webp`。
 */
export async function uploadImageDataUrlApi(body: { data: string; file_name: string; tenant_id?: string }): Promise<UploadImageResponse> {
  return apiPost<UploadImageResponse>('/api/upload/image', body);
}

export type UploadImageFileOptions = CompressImageOptions & {
  /** 租户门户图等需传 tenant_id，与员工 JWT 配合写入公开图 */
  tenant_id?: string;
};

/**
 * 浏览器端先压成 WebP（或 JPEG 回退），再上传；服务端仍会再次转 WebP，保证库内一致。
 */
export async function uploadImageFileAsWebp(file: File, options: UploadImageFileOptions): Promise<UploadImageResponse> {
  const { tenant_id, maxDimension, quality = 0.85, outputName = 'upload' } = options;
  const compressed = await compressImageToUploadableFile(file, { maxDimension, quality, outputName });
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(compressed);
  });
  const payload: { data: string; file_name: string; tenant_id?: string } = {
    data,
    file_name: compressed.name,
  };
  if (tenant_id) payload.tenant_id = tenant_id;
  return apiPost<UploadImageResponse>('/api/upload/image', payload);
}
