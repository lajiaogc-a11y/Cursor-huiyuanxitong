/**
 * System Config API Client — 维护模式 / 2FA / 功能开关 RPC 请求层
 */
import { apiGet, apiPost } from './client';

export const maintenanceApi = {
  getStatus: (tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/get_maintenance_mode_status', {
      tenant_id: tenantId || undefined,
    }),
  setMode: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/set_maintenance_mode', params),
  listTenantModes: () =>
    apiPost<unknown[]>('/api/data/rpc/list_tenant_maintenance_modes', {}),
};

export const login2faApi = {
  getSettings: (tenantId: string) =>
    apiPost<unknown>('/api/data/rpc/get_login_2fa_settings', { tenant_id: tenantId }),
  setSettings: (params: { tenant_id: string; enabled: boolean; method: string }) =>
    apiPost<unknown>('/api/data/rpc/set_login_2fa_settings', params),
};

export const featureFlagApi = {
  get: (tenantId: string, flagKey: string) =>
    apiPost<{ enabled: boolean }>('/api/data/rpc/get_tenant_feature_flag', { tenant_id: tenantId, flag_key: flagKey }),
  list: (tenantId: string) =>
    apiPost<unknown[]>('/api/data/rpc/list_tenant_feature_flags', { tenant_id: tenantId }),
  set: (tenantId: string, flagKey: string, enabled: boolean) =>
    apiPost<unknown>('/api/data/rpc/set_tenant_feature_flag', { tenant_id: tenantId, flag_key: flagKey, enabled }),
};

export const ipAccessApi = {
  check: () =>
    apiGet<unknown>('/api/data/settings/ip-country-check'),
};
