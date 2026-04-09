/**
 * 认证 API — HTTP 请求适配层
 *
 * 职责: 仅封装 /api/auth/* 端点请求，不含业务逻辑。
 * 业务编排请使用 services/auth/authApiService.ts。
 */
import { apiPost, apiGet } from './client';

export const authApi = {
  login: (body: { username: string; password: string; device_id?: string }) =>
    apiPost<unknown>('/api/auth/login', body),
  logout: () => apiPost<void>('/api/auth/logout', {}),
  verifyPassword: (body: { password: string }) =>
    apiPost<{ success?: boolean; valid?: boolean }>('/api/auth/verify-password', body),
  register: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/auth/register', body),
  syncPassword: (body: { username: string; password: string }) =>
    apiPost<unknown>('/api/auth/sync-password', body),
  me: () => apiGet<unknown>('/api/auth/me'),
  deviceWhitelistStatus: () => apiGet<unknown>('/api/auth/device-whitelist/status'),
  bindDevice: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/auth/devices/bind', body),
  listMyDevices: () => apiGet<unknown>('/api/auth/devices/me'),
  clientIp: () => apiGet<{ ip?: string }>('/api/auth/client-ip'),
  resolveLoginLogLocations: () => apiPost<void>('/api/logs/login/resolve-locations', {}),
  verifyEmployeeLoginDetailed: (username: string, password: string) =>
    apiPost<unknown>('/api/data/rpc/verify_employee_login_detailed', { p_username: username, p_password: password }),
};
