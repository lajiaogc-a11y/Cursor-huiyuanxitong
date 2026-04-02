/**
 * 平台「后台设备白名单」开关与配额（存 data_settings）
 */
export const ADMIN_DEVICE_WHITELIST_SETTING_KEY = 'admin_device_whitelist';

export type AdminDeviceWhitelistConfig = {
  enabled: boolean;
  max_devices_per_employee: number;
};

export const DEFAULT_ADMIN_DEVICE_WHITELIST: AdminDeviceWhitelistConfig = {
  enabled: false,
  max_devices_per_employee: 5,
};

export function normalizeAdminDeviceWhitelistConfig(raw: unknown): AdminDeviceWhitelistConfig {
  const base = { ...DEFAULT_ADMIN_DEVICE_WHITELIST };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
  const max = o.max_devices_per_employee;
  if (typeof max === 'number' && Number.isFinite(max)) {
    base.max_devices_per_employee = Math.min(100, Math.max(1, Math.floor(max)));
  }
  return base;
}
