/**
 * Data repository — employee_login_logs, currencies, lookups, shift_handovers
 */
import { query, queryOne } from '../../database/index.js';

export interface LoginLogRow {
  id: string;
  employee_id: string | null;
  username?: string | null;
  employee_name?: string;
  login_time: string;
  ip_address: string | null;
  ip_location?: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export interface CurrencyRow {
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  symbol?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ActivityTypeRow {
  id: string;
  value: string;
  label: string;
  is_active: boolean;
  sort_order: number;
}

export interface CustomerSourceRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftReceiverRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftHandoverRow {
  id: string;
  handover_employee_id: string | null;
  handover_employee_name: string;
  receiver_name: string;
  handover_time: string;
  card_merchant_data: unknown;
  payment_provider_data: unknown;
  remark: string | null;
  created_at: string;
}

function deriveIpLocation(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  const normalized = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return 'localhost';
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) {
    return 'LAN';
  }
  return null;
}

export async function listLoginLogsRepository(
  limit = 100,
  tenantId?: string | null,
  offset = 0,
  role = 'admin',
  employeeId?: string | null,
): Promise<{ rows: LoginLogRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (tenantId) {
    // 含 employee_id 为 NULL 的失败记录：只要当时尝试的用户名属于本租户员工即归属本租户（与仅按 employee_id 过滤相比，避免「记录消失」）
    conditions.push(
      `(
        employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)
        OR (
          employee_id IS NULL
          AND username IN (SELECT username FROM employees WHERE tenant_id = ?)
        )
      )`,
    );
    values.push(tenantId, tenantId);
  }

  // 角色级别过滤：admin 看全部（租户内），manager 看下属+自己，staff 只看自己
  if (role === 'staff' && employeeId) {
    conditions.push(`employee_id = ?`);
    values.push(employeeId);
  } else if (role === 'manager' && employeeId) {
    // manager 看自己 + 自己管理的员工（supervisor_id = 自己）
    conditions.push(
      `(
        employee_id = ?
        OR employee_id IN (SELECT id FROM employees WHERE supervisor_id = ?)
      )`,
    );
    values.push(employeeId, employeeId);
  }
  // admin: 不加额外过滤，看租户内全部
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM employee_login_logs ${whereClause}`,
    values
  );
  const total = Number(countResult[0]?.total ?? 0);

  const pageValues = [...values, limit, offset];
  const logsData = await query<LoginLogRow>(
    `SELECT id, employee_id, username,
            COALESCE(login_time, created_at) AS login_time,
            ip_address, ip_location, success, failure_reason, user_agent
     FROM employee_login_logs
     ${whereClause}
     ORDER BY COALESCE(login_time, created_at) DESC
     LIMIT ? OFFSET ?`,
    pageValues
  );

  const empIds = [...new Set(logsData.map((l) => l.employee_id).filter((id): id is string => !!id))];
  const employeeMap = new Map<string, string>();
  if (empIds.length > 0) {
    const placeholders = empIds.map(() => '?').join(',');
    const employeesData = await query<{ id: string; real_name: string }>(
      `SELECT id, real_name FROM employees WHERE id IN (${placeholders})`,
      empIds
    );
    employeesData.forEach((emp) => employeeMap.set(emp.id, emp.real_name));
  }

  const rows = logsData.map((log) => ({
    ...log,
    employee_name: log.employee_id
      ? employeeMap.get(log.employee_id) || '-'
      : (log.username?.trim() ? log.username : '-'),
    ip_location: log.ip_location || deriveIpLocation(log.ip_address),
  }));
  return { rows, total };
}

export async function listCurrenciesRepository(): Promise<CurrencyRow[]> {
  return await query<CurrencyRow>(
    `SELECT id, code, name_zh, name_en, symbol, badge_color, sort_order, is_active
     FROM currencies ORDER BY sort_order ASC, code ASC`
  );
}

export async function listActivityTypesRepository(): Promise<ActivityTypeRow[]> {
  // SELECT *：兼容历史表同时存在 name/code 与 label/value，由前端 API 层统一挑选展示名
  return await query<ActivityTypeRow>(
    `SELECT * FROM activity_types ORDER BY sort_order ASC, id ASC`
  );
}

export async function listCustomerSourcesRepository(): Promise<CustomerSourceRow[]> {
  return await query<CustomerSourceRow>(
    `SELECT id, name, sort_order, is_active, created_at, updated_at
     FROM customer_sources ORDER BY sort_order ASC, name ASC`
  );
}

export async function listShiftReceiversRepository(): Promise<ShiftReceiverRow[]> {
  return await query<ShiftReceiverRow>(
    `SELECT id, name, sort_order, created_at, updated_at
     FROM shift_receivers ORDER BY sort_order ASC, name ASC`
  );
}

export async function listShiftHandoversRepository(tenantId?: string | null): Promise<ShiftHandoverRow[]> {
  if (tenantId) {
    return await query<ShiftHandoverRow>(
      `SELECT sh.id, sh.handover_employee_id, sh.handover_employee_name, sh.receiver_name,
              sh.handover_time, sh.card_merchant_data, sh.payment_provider_data, sh.remark, sh.created_at
       FROM shift_handovers sh
       WHERE sh.handover_employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)
       ORDER BY sh.handover_time DESC`,
      [tenantId]
    );
  }
  return await query<ShiftHandoverRow>(
    `SELECT id, handover_employee_id, handover_employee_name, receiver_name,
            handover_time, card_merchant_data, payment_provider_data, remark, created_at
     FROM shift_handovers ORDER BY handover_time DESC`
  );
}
