import { authApi } from '@/api/auth';
import { platformApi } from '@/api/platform';

export type StaffDeviceWhitelistStatus = {
  enabled: boolean;
  max_devices_per_employee: number;
};

export async function fetchStaffDeviceWhitelistStatus(): Promise<StaffDeviceWhitelistStatus> {
  try {
    const data = (await authApi.deviceWhitelistStatus()) as StaffDeviceWhitelistStatus;
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
  const data = (await platformApi.deviceWhitelist.getConfig()) as Partial<StaffDeviceWhitelistStatus>;
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
  return platformApi.deviceWhitelist.saveConfig(patch) as Promise<StaffDeviceWhitelistStatus>;
}

export async function listPlatformEmployeeDevices(limit = 100, offset = 0): Promise<EmployeeDeviceDto[]> {
  const raw = await platformApi.deviceWhitelist.listDevices({
    limit,
    offset,
  });
  if (Array.isArray(raw)) return raw as EmployeeDeviceDto[];
  return [];
}

export async function adminAddEmployeeDevice(body: {
  username: string;
  device_id: string;
  device_name?: string;
}): Promise<{ id: string }> {
  return platformApi.deviceWhitelist.addDevice(body) as Promise<{ id: string }>;
}

export async function adminDeleteEmployeeDevice(id: string): Promise<void> {
  await platformApi.deviceWhitelist.deleteDevice(id);
}

export async function bindCurrentStaffDevice(body: {
  device_id: string;
  device_name?: string;
}): Promise<{ id: string; token: string | null }> {
  return authApi.bindDevice(body) as Promise<{ id: string; token: string | null }>;
}

export async function listMyStaffDevices(): Promise<EmployeeDeviceDto[]> {
  return authApi.listMyDevices() as Promise<EmployeeDeviceDto[]>;
}
