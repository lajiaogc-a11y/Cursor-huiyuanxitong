/**
 * Tenants Repository - 租户数据 (MySQL)
 */
import { query, queryOne, execute, getPool } from '../../database/index.js';
import { config } from '../../config/index.js';
import type { PoolConnection } from 'mysql2/promise';

export interface TenantRow {
  id: string;
  tenant_code: string;
  tenant_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_employee_id?: string | null;
  admin_username?: string | null;
  admin_real_name?: string | null;
  admin_count?: number | null;
}

export async function listTenantsRepository(): Promise<TenantRow[]> {
  const rows = await query<TenantRow>(
    `SELECT
       t.id,
       t.tenant_code,
       t.tenant_name,
       t.status,
       t.created_at,
       t.updated_at,
       t.admin_employee_id,
       e.username AS admin_username,
       e.real_name AS admin_real_name,
       (
         SELECT COUNT(*)
         FROM employees admin_emp
         WHERE admin_emp.tenant_id = t.id AND admin_emp.role = 'admin'
       ) AS admin_count
     FROM tenants t
     LEFT JOIN employees e ON e.id = t.admin_employee_id
     ORDER BY t.created_at DESC`
  );
  return rows ?? [];
}

export interface CreateTenantWithAdminInput {
  tenantCode: string;
  tenantName: string;
  adminUsername: string;
  adminRealName: string;
  adminPassword: string;
}

export interface TenantMutationResult {
  success: boolean;
  errorCode?: string;
  message?: string;
}

export interface CreateTenantWithAdminResult extends TenantMutationResult {
  tenantId?: string;
  adminEmployeeId?: string;
  adminUsername?: string;
  adminRealName?: string;
}

export interface ResetTenantAdminPasswordResult extends TenantMutationResult {
  adminEmployeeId?: string;
  adminUsername?: string;
  adminRealName?: string;
}

async function withMySQLTransaction<T>(runner: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await runner(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function createTenantWithAdminRepository(
  input: CreateTenantWithAdminInput
): Promise<CreateTenantWithAdminResult> {
  return withMySQLTransaction(async (conn) => {
    const tenantCode = input.tenantCode.trim();
    const tenantName = input.tenantName.trim();
    const adminUsername = input.adminUsername.trim();
    const adminRealName = input.adminRealName.trim();
    const adminPassword = input.adminPassword;

    if (!tenantCode || !tenantName || !adminUsername || !adminRealName || !adminPassword) {
      return { success: false, errorCode: 'VALIDATION_ERROR', message: 'Missing required fields' };
    }

    const [checkRows] = await conn.execute<any[]>(
      `SELECT
         EXISTS(SELECT 1 FROM tenants WHERE tenant_code = ?) AS tenant_code_exists,
         EXISTS(SELECT 1 FROM employees WHERE username = ?) AS admin_username_exists`,
      [tenantCode, adminUsername]
    );
    const check = checkRows[0];
    if (check?.tenant_code_exists) return { success: false, errorCode: 'TENANT_CODE_EXISTS' };
    if (check?.admin_username_exists) return { success: false, errorCode: 'ADMIN_USERNAME_EXISTS' };

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const tenantId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO tenants (id, tenant_code, tenant_name, status)
       VALUES (?, ?, ?, 'active')`,
      [tenantId, tenantCode, tenantName]
    );

    const adminEmployeeId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO employees (
         id, username, name, real_name, password_hash, role, status, visible, is_super_admin, tenant_id
       )
       VALUES (?, ?, ?, ?, ?, 'admin', 'active', true, false, ?)`,
      [adminEmployeeId, adminUsername, adminRealName, adminRealName, passwordHash, tenantId]
    );

    // 探针：回读并验证 bcrypt hash，失败则整个事务回滚
    const [probeRows] = await conn.execute(
      'SELECT password_hash FROM employees WHERE id = ? LIMIT 1',
      [adminEmployeeId]
    );
    const storedHash = (probeRows as any[])[0]?.password_hash;
    if (!storedHash || !(await bcrypt.compare(adminPassword, storedHash))) {
      throw new Error('PASSWORD_PROBE_FAILED');
    }

    await conn.query(
      `UPDATE tenants SET admin_employee_id = ?, updated_at = NOW() WHERE id = ?`,
      [adminEmployeeId, tenantId]
    );

    return {
      success: true,
      tenantId,
      adminEmployeeId,
      adminUsername,
      adminRealName,
    };
  });
}

export async function updateTenantBasicInfoRepository(input: {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  status: string;
}): Promise<TenantMutationResult> {
  return withMySQLTransaction(async (conn) => {
    const tenantCode = input.tenantCode.trim();
    const tenantName = input.tenantName.trim();
    const status = input.status.trim();
    if (!tenantCode || !tenantName || !status) {
      return { success: false, errorCode: 'VALIDATION_ERROR' };
    }

    const [existingRows] = await conn.execute<any[]>(
      'SELECT id FROM tenants WHERE id = ? LIMIT 1',
      [input.tenantId]
    );
    if (existingRows.length === 0) {
      return { success: false, errorCode: 'TENANT_NOT_FOUND' };
    }

    const [duplicateRows] = await conn.execute<any[]>(
      'SELECT id FROM tenants WHERE tenant_code = ? AND id <> ? LIMIT 1',
      [tenantCode, input.tenantId]
    );
    if (duplicateRows.length > 0) {
      return { success: false, errorCode: 'TENANT_CODE_EXISTS' };
    }

    await conn.query(
      `UPDATE tenants
       SET tenant_code = ?, tenant_name = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [tenantCode, tenantName, status, input.tenantId]
    );
    return { success: true };
  });
}

export async function resetTenantAdminPasswordRepository(input: {
  tenantId: string;
  adminEmployeeId?: string | null;
  newPassword: string;
}): Promise<ResetTenantAdminPasswordResult> {
  return withMySQLTransaction(async (conn) => {
    const newPassword = input.newPassword.trim();
    if (!newPassword) {
      return { success: false, errorCode: 'INVALID_PASSWORD' };
    }

    // 查找管理员：优先指定 ID，其次 tenant 的 admin_employee_id，最后 fallback
    let adminRow: { id: string; username: string; real_name: string } | null = null;

    if (input.adminEmployeeId) {
      const [rows] = await conn.execute<any[]>(
        'SELECT id, username, real_name FROM employees WHERE id = ? LIMIT 1',
        [input.adminEmployeeId]
      );
      adminRow = rows[0] ?? null;
    }
    if (!adminRow) {
      const [rows] = await conn.execute<any[]>(
        `SELECT e.id, e.username, e.real_name
         FROM employees e
         INNER JOIN tenants t ON t.admin_employee_id = e.id
         WHERE t.id = ? LIMIT 1`,
        [input.tenantId]
      );
      adminRow = rows[0] ?? null;
    }
    if (!adminRow) {
      const [rows] = await conn.execute<any[]>(
        `SELECT id, username, real_name FROM employees
         WHERE tenant_id = ? AND role = 'admin'
         ORDER BY created_at LIMIT 1`,
        [input.tenantId]
      );
      adminRow = rows[0] ?? null;
    }

    if (!adminRow) {
      return { success: false, errorCode: 'ADMIN_NOT_FOUND' };
    }

    const bcrypt = await import('bcryptjs');
    const pwdHash = await bcrypt.hash(newPassword, 10);
    await conn.query(
      `UPDATE employees SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
      [pwdHash, adminRow.id]
    );

    await conn.query(
      `UPDATE tenants SET admin_employee_id = COALESCE(admin_employee_id, ?), updated_at = NOW() WHERE id = ?`,
      [adminRow.id, input.tenantId]
    );

    return {
      success: true,
      adminEmployeeId: adminRow.id,
      adminUsername: adminRow.username,
      adminRealName: adminRow.real_name,
    };
  });
}

export async function setTenantSuperAdminRepository(employeeId: string): Promise<TenantMutationResult> {
  return withMySQLTransaction(async (conn) => {
    const [empRows] = await conn.execute<any[]>(
      'SELECT id, tenant_id FROM employees WHERE id = ? LIMIT 1',
      [employeeId]
    );
    const employee = empRows[0];
    if (!employee?.tenant_id) {
      return { success: false, errorCode: 'EMPLOYEE_NOT_FOUND' };
    }

    await conn.query(
      'UPDATE employees SET is_super_admin = false WHERE tenant_id = ? AND id <> ?',
      [employee.tenant_id, employeeId]
    );
    await conn.query(
      'UPDATE employees SET is_super_admin = true, updated_at = NOW() WHERE id = ?',
      [employeeId]
    );
    await conn.query(
      'UPDATE tenants SET admin_employee_id = ?, updated_at = NOW() WHERE id = ?',
      [employeeId, employee.tenant_id]
    );
    return { success: true };
  });
}

export async function syncAuthPasswordViaEdgeRepository(
  username: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  // MySQL 版：直接更新 employees 表的 password_hash
  try {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await execute('UPDATE employees SET password_hash = ?, updated_at = NOW() WHERE username = ?', [hash, username]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteTenantRepository(input: {
  tenantId: string;
  force?: boolean;
}): Promise<TenantMutationResult> {
  return withMySQLTransaction(async (conn) => {
    const [tenantRows] = await conn.execute<any[]>(
      'SELECT tenant_code FROM tenants WHERE id = ? LIMIT 1',
      [input.tenantId]
    );
    const tenant = tenantRows[0];
    if (!tenant) {
      return { success: false, errorCode: 'TENANT_NOT_FOUND' };
    }
    if (tenant.tenant_code === 'platform') {
      return { success: false, errorCode: 'CANNOT_DELETE_PLATFORM' };
    }

    const cleanupWarnings: string[] = [];

    const [dataTableRows] = await conn.execute<any[]>(
      `SELECT DISTINCT TABLE_NAME as table_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND COLUMN_NAME = 'tenant_id'
         AND TABLE_NAME NOT IN ('tenants', 'employees', 'role_permissions')
       ORDER BY TABLE_NAME`
    );

    let dataCount = 0;
    const dataDetails: string[] = [];
    for (const row of dataTableRows) {
      try {
        const [countRows] = await conn.execute<any[]>(
          `SELECT COUNT(*) AS count FROM \`${row.table_name}\` WHERE tenant_id = ?`,
          [input.tenantId]
        );
        const count = Number(countRows[0]?.count ?? 0);
        if (count > 0) {
          dataCount += count;
          dataDetails.push(`${row.table_name}(${count})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupWarnings.push(`count:${row.table_name}:${msg}`);
      }
    }

    if (dataCount > 0 && !input.force) {
      return {
        success: false,
        errorCode: 'TENANT_HAS_DATA',
        message: `${dataCount} business records: ${dataDetails.join(', ')}`,
      };
    }

    // 数据检查通过后才标记为 deleting，事务失败会回滚
    await conn.query(
      `UPDATE tenants SET status = 'deleting', updated_at = NOW() WHERE id = ?`,
      [input.tenantId]
    );

    await conn.query('UPDATE tenants SET admin_employee_id = null WHERE id = ?', [input.tenantId]);
    await conn.query(
      `UPDATE profiles SET employee_id = null
       WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );

    await conn.query(
      `DELETE FROM operation_logs
       WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `UPDATE operation_logs SET restored_by = null
       WHERE restored_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `DELETE FROM activity_gifts
       WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `UPDATE audit_records SET reviewer_id = null
       WHERE reviewer_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `UPDATE audit_records SET submitter_id = null
       WHERE submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `UPDATE employee_name_history SET changed_by = null
       WHERE changed_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId]
    );
    await conn.query(
      `DELETE FROM points_ledger
       WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)
          OR member_id IN (SELECT id FROM members WHERE tenant_id = ?)
          OR creator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [input.tenantId, input.tenantId, input.tenantId]
    );
    try {
      await conn.query(
        `DELETE FROM meika_zone_order_links WHERE tenant_id = ?`,
        [input.tenantId]
      );
    } catch { /* table may not exist yet */ }
    await conn.query(
      `DELETE ma FROM member_activity ma
       INNER JOIN members m ON m.id = ma.member_id
       WHERE m.tenant_id = ?`,
      [input.tenantId]
    );
    await conn.query(
      `DELETE ag FROM activity_gifts ag
       INNER JOIN members m ON m.id = ag.member_id
       WHERE m.tenant_id = ?`,
      [input.tenantId]
    );
    await conn.query(
      `UPDATE orders SET member_id = null WHERE tenant_id = ? AND member_id IS NOT NULL`,
      [input.tenantId]
    );
    await conn.query(
      `DELETE FROM orders WHERE tenant_id = ?`,
      [input.tenantId]
    );
    await conn.query(
      `DELETE FROM members WHERE tenant_id = ?`,
      [input.tenantId]
    );

    const safeStatements = [
      `UPDATE balance_change_logs SET operator_id = null WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE ledger_transactions SET operator_id = null WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM api_keys WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM data_backups WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE invitation_codes SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE knowledge_articles SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE knowledge_categories SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM permission_change_logs WHERE changed_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE permission_versions SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM risk_events WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = ?) OR resolved_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM risk_scores WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM shift_handovers WHERE handover_employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `DELETE FROM shift_receivers WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      `UPDATE webhooks SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = ?)`,
    ];
    for (const statement of safeStatements) {
      try {
        const paramCount = (statement.match(/\?/g) || []).length;
        const params = Array(paramCount).fill(input.tenantId);
        await conn.query(statement, params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupWarnings.push(`safe:${msg}`);
      }
    }

    await conn.query('DELETE FROM employees WHERE tenant_id = ?', [input.tenantId]);

    const [tenantScopedRows] = await conn.execute<any[]>(
      `SELECT DISTINCT TABLE_NAME as table_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND COLUMN_NAME = 'tenant_id'
         AND TABLE_NAME NOT IN ('tenants', 'employees')
       ORDER BY TABLE_NAME`
    );
    for (const row of tenantScopedRows) {
      try {
        await conn.query(`DELETE FROM \`${row.table_name}\` WHERE tenant_id = ?`, [input.tenantId]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupWarnings.push(`tenant_scoped:${row.table_name}:${msg}`);
      }
    }

    if (cleanupWarnings.length > 0) {
      console.warn(`[Tenants] delete tenant=${input.tenantId} warnings (${cleanupWarnings.length}):`, cleanupWarnings.join(' | '));
    }

    await conn.query('DELETE FROM tenants WHERE id = ?', [input.tenantId]);
    return { success: true, message: cleanupWarnings.length > 0 ? `${cleanupWarnings.length} cleanup warnings` : undefined };
  });
}
