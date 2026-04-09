/**
 * Admin Device Whitelist API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPut, apiPost, apiDelete } from './client';

export const adminDeviceWhitelistApi = {
  getConfig: () =>
    apiGet<unknown>('/api/platform/device-whitelist/config'),
  updateConfig: (data: Record<string, unknown>) =>
    apiPut<{ success: boolean }>('/api/platform/device-whitelist/config', data),
  listDevices: () =>
    apiGet<unknown[]>('/api/platform/device-whitelist/devices'),
  addDevice: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/platform/device-whitelist/devices', data),
  deleteDevice: (id: string) =>
    apiDelete<{ success: boolean }>(`/api/platform/device-whitelist/devices/${encodeURIComponent(id)}`),
};
