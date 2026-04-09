/**
 * Upload API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost } from './client';

export const uploadApi = {
  getPresignUrl: (imageId: string) =>
    apiGet<{ url: string }>(`/api/upload/image/${encodeURIComponent(imageId)}/presign`),
  uploadImage: (data: Record<string, unknown>) =>
    apiPost<{ id?: string; url?: string; success?: boolean }>('/api/upload/image', data),
  getImageUrl: (imageId: string) =>
    `/api/upload/image/${encodeURIComponent(imageId)}`,
};
