/**
 * API 客户端 - 兼容层，内部使用 apiClient
 * 新代码请直接使用 @/lib/apiClient 或 @/api/*
 */
import {
  apiClient,
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
  setMemberAccessToken,
  clearMemberAccessToken,
  ApiError,
  setOnUnauthorized,
  setOnMemberSessionReplaced,
  setOnForbidden,
  setOnServerError,
  API_ACCESS_TOKEN_KEY,
  MEMBER_ACCESS_TOKEN_KEY,
  type ApiFetchInit,
} from '@/lib/apiClient';

export {
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
  setMemberAccessToken,
  clearMemberAccessToken,
  ApiError,
  setOnUnauthorized,
  setOnMemberSessionReplaced,
  setOnForbidden,
  setOnServerError,
  API_ACCESS_TOKEN_KEY,
  MEMBER_ACCESS_TOKEN_KEY,
};

export const apiGet = <T>(path: string, fetchInit?: ApiFetchInit) => apiClient.get<T>(path, fetchInit);
export const apiPost = <T>(path: string, body?: unknown) => apiClient.post<T>(path, body);
/** 员工数据表代理等：在会员域路由下也必须带员工 JWT */
export const apiGetAsStaff = <T>(path: string, fetchInit?: ApiFetchInit) =>
  apiClient.getAsStaff<T>(path, fetchInit);
export const apiPostAsStaff = <T>(path: string, body?: unknown) => apiClient.postAsStaff<T>(path, body);
export const apiPatchAsStaff = <T>(path: string, body?: unknown) => apiClient.patchAsStaff<T>(path, body);
export const apiPutAsStaff = <T>(path: string, body?: unknown) => apiClient.putAsStaff<T>(path, body);
export const apiDeleteAsStaff = <T>(path: string) => apiClient.deleteAsStaff<T>(path);
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
