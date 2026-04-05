/**
 * Auth Repository - 认证相关数据访问（MySQL 版）
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../../database/index.js';

export interface VerifyEmployeeResult {
  employee_id: string;
  username: string;
  real_name: string;
  role: string;
  status: string;
  is_super_admin: boolean;
  is_platform_super_admin?: boolean;
  tenant_id?: string | null;
  tenant_code?: string | null;
  error_code?: string;
}

export async function verifyEmployeeLoginRepository(
  username: string,
  password: string
): Promise<{ data: VerifyEmployeeResult[] | null; error: Error | null }> {
  try {
    const row = await queryOne<{
      id: string; username: string; real_name: string; role: string;
      status: string; is_super_admin: number; password_hash: string;
      tenant_id: string | null;
    }>(
      'SELECT id, username, real_name, role, status, is_super_admin, password_hash, tenant_id FROM employees WHERE username = ?',
      [username.trim()]
    );
    if (!row) {
      return { data: [{ error_code: 'USER_NOT_FOUND' } as any], error: null };
    }
    const match = await bcrypt.compare(password, row.password_hash || '');
    if (!match) {
      return { data: [{ error_code: 'WRONG_PASSWORD' } as any], error: null };
    }
    if (row.status === 'disabled') {
      return { data: [{ error_code: 'ACCOUNT_DISABLED' } as any], error: null };
    }
    // 查询 tenant_code
    let tenantCode: string | null = null;
    if (row.tenant_id) {
      const t = await queryOne<{ tenant_code: string }>('SELECT tenant_code FROM tenants WHERE id = ?', [row.tenant_id]);
      tenantCode = t?.tenant_code ?? null;
    }
    const isPlatformSuperAdmin = tenantCode === 'platform' && (!!row.is_super_admin || row.role === 'admin');
    return {
      data: [{
        employee_id: row.id,
        username: row.username,
        real_name: row.real_name,
        role: row.role,
        status: row.status,
        is_super_admin: !!row.is_super_admin,
        is_platform_super_admin: isPlatformSuperAdmin,
        tenant_id: row.tenant_id,
        tenant_code: tenantCode,
      }],
      error: null,
    };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function checkEmployeeLoginLockRepository(
  username: string
): Promise<{ is_locked: boolean; remaining_seconds: number }> {
  // 简化实现：检查最近 15 分钟内失败次数 >= 5 则锁定
  const row = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM employee_login_logs
     WHERE username = ? AND success = 0 AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
    [username.trim()]
  );
  if (row && row.cnt >= 5) {
    return { is_locked: true, remaining_seconds: 900 };
  }
  return { is_locked: false, remaining_seconds: 0 };
}

export async function getMaintenanceModeStatusRepository(
  tenantId: string | null
): Promise<{ effectiveEnabled: boolean; globalMessage?: string; allowedRoles?: string[] }> {
  const global = await queryOne<{ enabled: number; message: string | null; allowed_roles: string | null }>(
    'SELECT enabled, message, allowed_roles FROM maintenance_mode LIMIT 1'
  );
  if (global?.enabled) {
    let allowedRoles: string[] = [];
    try { allowedRoles = global.allowed_roles ? JSON.parse(global.allowed_roles) : []; } catch { /* ignore */ }
    return { effectiveEnabled: true, globalMessage: global.message ?? undefined, allowedRoles };
  }
  if (tenantId) {
    const tenant = await queryOne<{ enabled: number; allowed_roles: string | null }>(
      'SELECT enabled, allowed_roles FROM tenant_maintenance_modes WHERE tenant_id = ?',
      [tenantId]
    );
    if (tenant?.enabled) {
      let allowedRoles: string[] = [];
      try { allowedRoles = tenant.allowed_roles ? JSON.parse(tenant.allowed_roles) : []; } catch { /* ignore */ }
      return { effectiveEnabled: true, allowedRoles };
    }
  }
  return { effectiveEnabled: false };
}

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

async function resolveIpLocation(ip: string | null): Promise<string | null> {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return 'localhost';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) return 'LAN';
  try {
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,country,regionName,city&lang=zh-CN`,
      { signal: AbortSignal.timeout(3000) },
    );
    const data = await resp.json() as { status: string; country?: string; regionName?: string; city?: string };
    if (data.status === 'success') {
      const parts = [data.city, data.regionName, data.country].filter(Boolean);
      return parts.join(', ') || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function logEmployeeLoginRepository(
  employeeId: string | null,
  ipAddress: string | null,
  userAgent: string,
  success: boolean,
  failureReason?: string,
  usernameOverride?: string,
): Promise<void> {
  try {
    let username = usernameOverride ?? '';
    if (!username && employeeId) {
      const emp = await queryOne<{ username: string }>('SELECT username FROM employees WHERE id = ?', [employeeId]);
      username = emp?.username ?? '';
    }
    const locationRaw = await resolveIpLocation(ipAddress).catch(() => null);
    const location =
      locationRaw && locationRaw.length > 255 ? `${locationRaw.slice(0, 252)}...` : locationRaw;
    await execute(
      `INSERT INTO employee_login_logs (id, employee_id, username, ip_address, ip_location, user_agent, success, failure_reason, created_at, login_time, action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), 'login')`,
      [randomUUID(), employeeId, username, ipAddress, location, userAgent, success ? 1 : 0, failureReason ?? null]
    );
  } catch (e) {
    console.error('[Auth] logEmployeeLoginRepository FAILED:', (e as Error).message, { employeeId, success });
  }
}

export async function clearEmployeeLoginFailuresRepository(employeeId: string): Promise<void> {
  // 清除最近的失败记录（简化：不做操作，锁定靠时间窗口自动解除）
}

export async function signupEmployeeRepository(params: {
  username: string;
  password: string;
  realName: string;
  invitationCode: string | null;
}): Promise<{ success: boolean; error_code?: string; assigned_status?: string }> {
  // 检查用户名是否已存在
  const existing = await queryOne<{ id: string }>('SELECT id FROM employees WHERE username = ?', [params.username.trim()]);
  if (existing) {
    return { success: false, error_code: 'USERNAME_EXISTS' };
  }
  // 检查邀请码
  let tenantId: string | null = null;
  let assignedStatus = 'pending';
  if (params.invitationCode) {
    const code = await queryOne<{ id: string; tenant_id: string | null; status: string; max_uses: number; used_count: number }>(
      'SELECT id, tenant_id, status, max_uses, used_count FROM invitation_codes WHERE code = ?',
      [params.invitationCode]
    );
    if (!code) return { success: false, error_code: 'INVALID_INVITATION_CODE' };
    if (code.status !== 'active') return { success: false, error_code: 'INVITATION_CODE_EXPIRED' };
    if (code.max_uses > 0 && code.used_count >= code.max_uses) return { success: false, error_code: 'INVITATION_CODE_USED' };
    tenantId = code.tenant_id;
    assignedStatus = 'active';
    // 更新使用次数
    await execute('UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?', [code.id]);
  }
  // 创建员工
  const hash = await bcrypt.hash(params.password, 10);
  await execute(
    `INSERT INTO employees (id, username, password_hash, name, real_name, role, status, is_super_admin, tenant_id, created_at, updated_at)
     VALUES (UUID(), ?, ?, ?, ?, 'staff', ?, 0, ?, NOW(), NOW())`,
    [params.username.trim(), hash, params.realName, params.realName, assignedStatus, tenantId]
  );
  return { success: true, assigned_status: assignedStatus };
}

export async function getEmployeeByIdRepository(employeeId: string): Promise<VerifyEmployeeResult | null> {
  const row = await queryOne<{
    id: string; username: string; real_name: string; role: string;
    status: string; is_super_admin: number; tenant_id: string | null;
  }>(
    'SELECT id, username, real_name, role, status, is_super_admin, tenant_id FROM employees WHERE id = ?',
    [employeeId]
  );
  if (!row) return null;
  let tenantCode: string | null = null;
  if (row.tenant_id) {
    const t = await queryOne<{ tenant_code: string }>('SELECT tenant_code FROM tenants WHERE id = ?', [row.tenant_id]);
    tenantCode = t?.tenant_code ?? null;
  }
  const isPlatformSuperAdmin = tenantCode === 'platform' && (!!row.is_super_admin || row.role === 'admin');
  return {
    employee_id: row.id,
    username: row.username,
    real_name: row.real_name,
    role: row.role,
    status: row.status,
    is_super_admin: !!row.is_super_admin,
    is_platform_super_admin: isPlatformSuperAdmin,
    tenant_id: row.tenant_id,
    tenant_code: tenantCode,
  };
}
