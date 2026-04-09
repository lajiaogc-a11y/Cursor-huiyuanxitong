/**
 * Platform Admin API Client — 纯 HTTP 请求层
 * 覆盖 /api/platform/* 端点 (设备白名单管理等)
 */
import { apiGetAsStaff, apiPutAsStaff, apiPostAsStaff, apiDeleteAsStaff } from './client';

export const platformApi = {
  deviceWhitelist: {
    getConfig: () =>
      apiGetAsStaff<unknown>('/api/platform/device-whitelist/config'),
    saveConfig: (body: Record<string, unknown>) =>
      apiPutAsStaff<unknown>('/api/platform/device-whitelist/config', body),
    listDevices: (params?: Record<string, string | number>) => {
      const sp = new URLSearchParams();
      if (params) for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
      const q = sp.toString();
      return apiGetAsStaff<unknown>(`/api/platform/device-whitelist/devices${q ? `?${q}` : ''}`);
    },
    addDevice: (body: Record<string, unknown>) =>
      apiPostAsStaff<unknown>('/api/platform/device-whitelist/devices', body),
    deleteDevice: (id: string) =>
      apiDeleteAsStaff<void>(`/api/platform/device-whitelist/devices/${encodeURIComponent(id)}`),
  },
};
