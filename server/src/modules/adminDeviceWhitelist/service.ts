import {
  getAdminDeviceWhitelistConfigRepository,
  setAdminDeviceWhitelistConfigRepository,
  listEmployeeDevicesForAdminRepository,
  listDevicesForEmployeeRepository,
  deleteEmployeeDeviceByIdRepository,
  getEmployeeIdByUsernameRepository,
  upsertAllowedEmployeeDeviceRepository,
  countAllowedDevicesRepository,
  isEmployeeDeviceAllowedRepository,
  touchEmployeeDeviceLoginRepository,
  type EmployeeDeviceRow,
} from './repository.js';
import type { AdminDeviceWhitelistConfig } from './settings.js';
import { normalizeStaffDeviceId } from './deviceId.js';

/** 部分环境 schema-patch 未跑到设备白名单段：首次访问时幂等补表，避免 500 */
let migrateOnce: Promise<void> | null = null;
async function ensureDeviceWhitelistSchema(): Promise<void> {
  if (!migrateOnce) {
    migrateOnce = (async () => {
      try {
        const { migrateEmployeeDevicesTable } = await import('./migrate.js');
        await migrateEmployeeDevicesTable();
      } catch (e) {
        console.warn('[AdminDeviceWhitelist] migrateEmployeeDevicesTable:', (e as Error).message);
      }
    })();
  }
  await migrateOnce;
}

export async function getWhitelistConfig(): Promise<AdminDeviceWhitelistConfig> {
  await ensureDeviceWhitelistSchema();
  return getAdminDeviceWhitelistConfigRepository();
}

export async function updateWhitelistConfig(patch: Partial<AdminDeviceWhitelistConfig>): Promise<AdminDeviceWhitelistConfig> {
  await ensureDeviceWhitelistSchema();
  const cur = await getAdminDeviceWhitelistConfigRepository();
  const next: AdminDeviceWhitelistConfig = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
    max_devices_per_employee:
      typeof patch.max_devices_per_employee === 'number'
        ? patch.max_devices_per_employee
        : cur.max_devices_per_employee,
  };
  await setAdminDeviceWhitelistConfigRepository(next);
  return getAdminDeviceWhitelistConfigRepository();
}

export async function listDevicesAdmin(limit: number, offset: number): Promise<EmployeeDeviceRow[]> {
  await ensureDeviceWhitelistSchema();
  return listEmployeeDevicesForAdminRepository(limit, offset);
}

export async function listDevicesSelf(employeeId: string): Promise<EmployeeDeviceRow[]> {
  await ensureDeviceWhitelistSchema();
  return listDevicesForEmployeeRepository(employeeId);
}

export async function deleteDevice(deviceId: string): Promise<boolean> {
  await ensureDeviceWhitelistSchema();
  return deleteEmployeeDeviceByIdRepository(deviceId);
}

export async function adminAddDevice(params: {
  username: string;
  deviceId: string;
  deviceName?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await ensureDeviceWhitelistSchema();
  const did = normalizeStaffDeviceId(params.deviceId);
  if (!did) return { ok: false, error: 'Invalid device_id format' };
  const empId = await getEmployeeIdByUsernameRepository(params.username);
  if (!empId) return { ok: false, error: 'Staff username not found' };

  const cfg = await getAdminDeviceWhitelistConfigRepository();
  const existingAllowed = await isEmployeeDeviceAllowedRepository(empId, did);
  if (!existingAllowed) {
    const cnt = await countAllowedDevicesRepository(empId);
    if (cnt >= cfg.max_devices_per_employee) {
      return { ok: false, error: `Device limit reached for this account (${cfg.max_devices_per_employee} devices)` };
    }
  }

  const name = params.deviceName?.trim() ? params.deviceName.trim().slice(0, 255) : null;
  const r = await upsertAllowedEmployeeDeviceRepository({
    employeeId: empId,
    deviceId: did,
    deviceName: name,
  });
  return { ok: true, id: r.id };
}

export async function bindCurrentDevice(params: {
  employeeId: string;
  deviceId: string;
  deviceName?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await ensureDeviceWhitelistSchema();
  const did = normalizeStaffDeviceId(params.deviceId);
  if (!did) return { ok: false, error: 'Invalid device_id format' };

  const cfg = await getAdminDeviceWhitelistConfigRepository();
  const existingAllowed = await isEmployeeDeviceAllowedRepository(params.employeeId, did);
  if (!existingAllowed) {
    const cnt = await countAllowedDevicesRepository(params.employeeId);
    if (cnt >= cfg.max_devices_per_employee) {
      return { ok: false, error: `Device limit reached (${cfg.max_devices_per_employee} devices). Please contact an administrator.` };
    }
  }

  const name = params.deviceName?.trim() ? params.deviceName.trim().slice(0, 255) : null;
  const r = await upsertAllowedEmployeeDeviceRepository({
    employeeId: params.employeeId,
    deviceId: did,
    deviceName: name,
  });
  return { ok: true, id: r.id };
}

export async function onSuccessfulStaffLoginWithDevice(params: {
  employeeId: string;
  deviceId: string;
  clientIp: string | null;
}): Promise<void> {
  try {
    await touchEmployeeDeviceLoginRepository(params.employeeId, params.deviceId, params.clientIp);
  } catch (e) {
    console.warn('[AdminDeviceWhitelist] touchEmployeeDeviceLoginRepository:', (e as Error).message);
  }
}

export { isEmployeeDeviceAllowedRepository };
