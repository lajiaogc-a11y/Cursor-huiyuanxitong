import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { safeParseJsonColumn } from '../data/repository.js';
import {
  ADMIN_DEVICE_WHITELIST_SETTING_KEY,
  DEFAULT_ADMIN_DEVICE_WHITELIST,
  normalizeAdminDeviceWhitelistConfig,
  type AdminDeviceWhitelistConfig,
} from './settings.js';

export type EmployeeDeviceRow = {
  id: string;
  employee_id: string;
  device_id: string;
  device_name: string | null;
  is_allowed: number;
  created_at: Date;
  last_login_at: Date | null;
  last_login_ip: string | null;
  username?: string;
  real_name?: string;
};

export async function getAdminDeviceWhitelistConfigRepository(): Promise<AdminDeviceWhitelistConfig> {
  try {
    const row = await queryOne<{ setting_value: unknown }>(
      `SELECT setting_value FROM data_settings WHERE setting_key = ? LIMIT 1`,
      [ADMIN_DEVICE_WHITELIST_SETTING_KEY],
    );
    return normalizeAdminDeviceWhitelistConfig(
      safeParseJsonColumn(row?.setting_value, ADMIN_DEVICE_WHITELIST_SETTING_KEY),
    );
  } catch (e) {
    console.error('[AdminDeviceWhitelist] getAdminDeviceWhitelistConfigRepository:', (e as Error).message);
    return { ...DEFAULT_ADMIN_DEVICE_WHITELIST };
  }
}

export async function listEmployeeDevicesForAdminRepository(
  limit: number,
  offset: number,
): Promise<EmployeeDeviceRow[]> {
  const lim = Math.min(500, Math.max(1, limit));
  const off = Math.max(0, offset);
  try {
    return query<EmployeeDeviceRow>(
      `SELECT d.id, d.employee_id, d.device_id, d.device_name, d.is_allowed, d.created_at, d.last_login_at, d.last_login_ip,
            e.username, e.real_name
     FROM employee_devices d
     LEFT JOIN employees e ON e.id = d.employee_id
     ORDER BY d.last_login_at DESC, d.created_at DESC
     LIMIT ? OFFSET ?`,
      [lim, off],
    );
  } catch (e) {
    console.error('[AdminDeviceWhitelist] listEmployeeDevicesForAdminRepository:', (e as Error).message);
    return [];
  }
}

export async function setAdminDeviceWhitelistConfigRepository(
  config: AdminDeviceWhitelistConfig,
): Promise<void> {
  const json = JSON.stringify(normalizeAdminDeviceWhitelistConfig(config));
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM data_settings WHERE setting_key = ? LIMIT 1`,
    [ADMIN_DEVICE_WHITELIST_SETTING_KEY],
  );
  if (existing) {
    await execute(`UPDATE data_settings SET setting_value = ? WHERE setting_key = ?`, [
      json,
      ADMIN_DEVICE_WHITELIST_SETTING_KEY,
    ]);
  } else {
    await execute(`INSERT INTO data_settings (id, setting_key, setting_value) VALUES (UUID(), ?, ?)`, [
      ADMIN_DEVICE_WHITELIST_SETTING_KEY,
      json,
    ]);
  }
}

export async function isEmployeeDeviceAllowedRepository(
  employeeId: string,
  deviceId: string,
): Promise<boolean> {
  const row = await queryOne<{ c: number }>(
    `SELECT 1 AS c FROM employee_devices
     WHERE employee_id = ? AND device_id = ? AND is_allowed = 1 LIMIT 1`,
    [employeeId, deviceId],
  );
  return !!row;
}

export async function touchEmployeeDeviceLoginRepository(
  employeeId: string,
  deviceId: string,
  clientIp: string | null,
): Promise<void> {
  const ip = (clientIp || '').trim().slice(0, 64) || null;
  await execute(
    `UPDATE employee_devices SET last_login_at = NOW(), last_login_ip = ? WHERE employee_id = ? AND device_id = ?`,
    [ip, employeeId, deviceId],
  );
}

export async function countAllowedDevicesRepository(employeeId: string): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM employee_devices WHERE employee_id = ? AND is_allowed = 1`,
    [employeeId],
  );
  return Number(row?.c) || 0;
}

export async function listDevicesForEmployeeRepository(employeeId: string): Promise<EmployeeDeviceRow[]> {
  return query<EmployeeDeviceRow>(
    `SELECT id, employee_id, device_id, device_name, is_allowed, created_at, last_login_at, last_login_ip
     FROM employee_devices WHERE employee_id = ? ORDER BY last_login_at DESC, created_at DESC`,
    [employeeId],
  );
}

export async function deleteEmployeeDeviceByIdRepository(id: string): Promise<boolean> {
  const r = await execute(`DELETE FROM employee_devices WHERE id = ?`, [id]);
  return r.affectedRows > 0;
}

export async function getEmployeeIdByUsernameRepository(username: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM employees WHERE username = ? LIMIT 1`,
    [username.trim()],
  );
  return row?.id ?? null;
}

/**
 * 插入或更新为已授权；若曾存在且 is_allowed=0 则恢复为 1
 */
export async function upsertAllowedEmployeeDeviceRepository(params: {
  employeeId: string;
  deviceId: string;
  deviceName: string | null;
}): Promise<{ id: string; created: boolean }> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM employee_devices WHERE employee_id = ? AND device_id = ? LIMIT 1`,
    [params.employeeId, params.deviceId],
  );
  if (existing) {
    await execute(
      `UPDATE employee_devices SET is_allowed = 1, device_name = COALESCE(?, device_name) WHERE id = ?`,
      [params.deviceName, existing.id],
    );
    return { id: existing.id, created: false };
  }
  const id = randomUUID();
  await execute(
    `INSERT INTO employee_devices (id, employee_id, device_id, device_name, is_allowed, created_at)
     VALUES (?, ?, ?, ?, 1, NOW())`,
    [id, params.employeeId, params.deviceId, params.deviceName],
  );
  return { id, created: true };
}
