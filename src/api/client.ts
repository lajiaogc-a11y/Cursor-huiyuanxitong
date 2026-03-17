/**
 * API 客户端 - 兼容层，内部使用 apiClient
 * 新代码请直接使用 @/lib/apiClient 或 @/api/*
 */
import {
  apiClient,
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
  ApiError,
  setOnUnauthorized,
  setOnForbidden,
  setOnServerError,
} from '@/lib/apiClient';

export {
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
  ApiError,
  setOnUnauthorized,
  setOnForbidden,
  setOnServerError,
};

export const apiGet = <T>(path: string) => apiClient.get<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => apiClient.post<T>(path, body);
export const apiPut = <T>(path: string, body?: unknown) => apiClient.put<T>(path, body);
export const apiPatch = <T>(path: string, body?: unknown) => apiClient.patch<T>(path, body);
export const apiDelete = <T>(path: string) => apiClient.delete<T>(path);

/** 兼容 apiClient 返回：可能直接返回 data，或返回 { success, data } */
export function unwrapApiData<T>(res: unknown): T | null {
  if (res === null || res === undefined) return null;
  if (Array.isArray(res)) return res as T;
  if (typeof res === 'object' && res !== null && 'data' in res) {
    const d = (res as { data?: T }).data;
    return d !== undefined ? d : null;
  }
  return res as T;
}
