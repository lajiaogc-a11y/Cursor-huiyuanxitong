import { apiPost } from '@/api/client';

export interface UploadImageResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export async function uploadImageDataUrlApi(body: { data: string; file_name: string }): Promise<UploadImageResponse> {
  return apiPost<UploadImageResponse>('/api/upload/image', body);
}
