/**
 * 日志相关 SQL（员工登录 IP 解析等）
 */
import { query, execute } from '../../database/index.js';

export interface EmployeeLoginLogPendingLocationRow {
  id: string;
  ip_address: string;
}

export async function selectEmployeeLoginLogsPendingLocation(
  limit = 100,
): Promise<EmployeeLoginLogPendingLocationRow[]> {
  return query<EmployeeLoginLogPendingLocationRow>(
    `SELECT id, ip_address FROM employee_login_logs
       WHERE ip_location IS NULL AND ip_address IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function updateEmployeeLoginLogIpLocation(id: string, location: string): Promise<void> {
  await execute('UPDATE employee_login_logs SET ip_location = ? WHERE id = ?', [location, id]);
}

/** 与 `service` 层沿用名称一致 */
export const listLoginLogsMissingIpLocation = selectEmployeeLoginLogsPendingLocation;
