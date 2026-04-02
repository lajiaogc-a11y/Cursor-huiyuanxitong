import {
  apiGet,
  apiGetAsStaff,
  apiPutAsStaff,
  apiPostAsStaff,
  apiDeleteAsStaff,
} from '@/api/client';

export type StaffDeviceWhitelistStatus = {
  enabled: boolean;
  max_devices_per_employee: number;
};

export async function fetchStaffDeviceWhitelistStatus(): Promise<StaffDeviceWhitelistStatus> {
  try {
    const data = await apiGet<StaffDeviceWhitelistStatus>('/api/auth/device-whitelist/status');
    if (data && typeof data === 'object' && typeof data.enabled === 'boolean') return data;
  } catch {
    /* ignore */
  }
  return { enabled: false, max_devices_per_employee: 5 };
}

export type EmployeeDeviceDto = {
  id: string;
  employee_id: string;
  device_id: string;
  device_name: string | null;
  is_allowed: number;
  created_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  username?: string;
  real_name?: string;
};

export async function fetchPlatformDeviceWhitelistConfig(): Promise<StaffDeviceWhitelistStatus> {
  const data = await apiGetAsStaff<Partial<StaffDeviceWhitelistStatus>>(
    '/api/platform/device-whitelist/config',
  );
  return {
    enabled: typeof data?.enabled === 'boolean' ? data.enabled : false,
    max_devices_per_employee:
      typeof data?.max_devices_per_employee === 'number' && Number.isFinite(data.max_devices_per_employee)
        ? Math.min(100, Math.max(1, Math.floor(data.max_devices_per_employee)))
        : 5,
  };
}

export async function savePlatformDeviceWhitelistConfig(
  patch: Partial<StaffDeviceWhitelistStatus>
): Promise<StaffDeviceWhitelistStatus> {
  return apiPutAsStaff<StaffDeviceWhitelistStatus>('/api/platform/device-whitelist/config', patch);
}

export async function listPlatformEmployeeDevices(limit = 100, offset = 0): Promise<EmployeeDeviceDto[]> {
  const raw = await apiGetAsStaff<unknown>(
    `/api/platform/device-whitelist/devices?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
  );
  if (Array.isArray(raw)) return raw as EmployeeDeviceDto[];
  return [];
}

export async function adminAddEmployeeDevice(body: {
  username: string;
  device_id: string;
  device_name?: string;
}): Promise<{ id: string }> {
  return apiPostAsStaff<{ id: string }>('/api/platform/device-whitelist/devices', body);
}

export async function adminDeleteEmployeeDevice(id: string): Promise<void> {
  await apiDeleteAsStaff(`/api/platform/device-whitelist/devices/${encodeURIComponent(id)}`);
}

export async function bindCurrentStaffDevice(body: {
  device_id: string;
  device_name?: string;
}): Promise<{ id: string; token: string | null }> {
  return apiPost<{ id: string; token: string | null }>('/api/auth/devices/bind', body);
}

export async function listMyStaffDevices(): Promise<EmployeeDeviceDto[]> {
  return apiGet<EmployeeDeviceDto[]>('/api/auth/devices/me');
}
