/**
 * Tenants Repository - 租户数据
 */
import type { PoolClient } from 'pg';
import { supabaseAdmin } from '../../database/index.js';
import { config } from '../../config/index.js';
import { getPgPool, queryPg } from '../../database/pg.js';

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
  if (getPgPool()) {
    const rows = await queryPg<TenantRow>(
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
           SELECT COUNT(*)::int
           FROM employees admin_emp
           WHERE admin_emp.tenant_id = t.id AND admin_emp.role = 'admin'
         ) AS admin_count
       FROM tenants t
       LEFT JOIN employees e ON e.id = t.admin_employee_id
       ORDER BY t.created_at DESC`
    );
    return rows ?? [];
  }
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, tenant_code, tenant_name, status, created_at, updated_at, admin_employee_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TenantRow[];
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

async function withPgTransaction<T>(runner: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  if (!pool) {
    throw new Error('DATABASE_URL 或 DATABASE_PASSWORD 未配置');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runner(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTenantWithAdminRepository(
  input: CreateTenantWithAdminInput
): Promise<CreateTenantWithAdminResult> {
  return withPgTransaction(async (client) => {
    const tenantCode = input.tenantCode.trim();
    const tenantName = input.tenantName.trim();
    const adminUsername = input.adminUsername.trim();
    const adminRealName = input.adminRealName.trim();
    const adminPassword = input.adminPassword;

    if (!tenantCode || !tenantName || !adminUsername || !adminRealName || !adminPassword) {
      return { success: false, errorCode: 'VALIDATION_ERROR', message: 'Missing required fields' };
    }

    const duplicateChecks = await client.query<{
      tenant_code_exists: boolean;
      admin_username_exists: boolean;
      admin_real_name_exists: boolean;
    }>(
      `SELECT
         EXISTS(SELECT 1 FROM tenants WHERE tenant_code = $1) AS tenant_code_exists,
         EXISTS(SELECT 1 FROM employees WHERE username = $2) AS admin_username_exists,
         EXISTS(SELECT 1 FROM employees WHERE real_name = $3) AS admin_real_name_exists`,
      [tenantCode, adminUsername, adminRealName]
    );
    const check = duplicateChecks.rows[0];
    if (check?.tenant_code_exists) return { success: false, errorCode: 'TENANT_CODE_EXISTS' };
    if (check?.admin_username_exists) return { success: false, errorCode: 'ADMIN_USERNAME_EXISTS' };
    if (check?.admin_real_name_exists) return { success: false, errorCode: 'ADMIN_REAL_NAME_EXISTS' };

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (tenant_code, tenant_name, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [tenantCode, tenantName]
    );
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) {
      return { success: false, errorCode: 'CREATE_FAILED' };
    }

    const employeeResult = await client.query<{ id: string }>(
      `INSERT INTO employees (
         username, real_name, password_hash, role, status, visible, is_super_admin, tenant_id
       )
       VALUES (
         $1, $2, extensions.crypt($3, extensions.gen_salt('bf')),
         'admin', 'active', true, false, $4
       )
       RETURNING id`,
      [adminUsername, adminRealName, adminPassword, tenantId]
    );
    const adminEmployeeId = employeeResult.rows[0]?.id;
    if (!adminEmployeeId) {
      return { success: false, errorCode: 'CREATE_FAILED' };
    }

    await client.query(
      `UPDATE tenants
       SET admin_employee_id = $1, updated_at = now()
       WHERE id = $2`,
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
  return withPgTransaction(async (client) => {
    const tenantCode = input.tenantCode.trim();
    const tenantName = input.tenantName.trim();
    const status = input.status.trim();
    if (!tenantCode || !tenantName || !status) {
      return { success: false, errorCode: 'VALIDATION_ERROR' };
    }

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM tenants WHERE id = $1 LIMIT 1',
      [input.tenantId]
    );
    if (existing.rows.length === 0) {
      return { success: false, errorCode: 'TENANT_NOT_FOUND' };
    }

    const duplicate = await client.query<{ id: string }>(
      'SELECT id FROM tenants WHERE tenant_code = $1 AND id <> $2 LIMIT 1',
      [tenantCode, input.tenantId]
    );
    if (duplicate.rows.length > 0) {
      return { success: false, errorCode: 'TENANT_CODE_EXISTS' };
    }

    await client.query(
      `UPDATE tenants
       SET tenant_code = $1, tenant_name = $2, status = $3, updated_at = now()
       WHERE id = $4`,
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
  return withPgTransaction(async (client) => {
    const newPassword = input.newPassword.trim();
    if (!newPassword) {
      return { success: false, errorCode: 'INVALID_PASSWORD' };
    }

    const employeeResult = await client.query<{
      id: string;
      username: string;
      real_name: string;
    }>(
      `SELECT e.id, e.username, e.real_name
       FROM employees e
       WHERE e.id = COALESCE(
         $1::uuid,
         (SELECT t.admin_employee_id FROM tenants t WHERE t.id = $2 LIMIT 1),
         (SELECT e2.id FROM employees e2 WHERE e2.tenant_id = $2 AND e2.role = 'admin' ORDER BY e2.created_at LIMIT 1)
       )
       LIMIT 1`,
      [input.adminEmployeeId ?? null, input.tenantId]
    );

    const admin = employeeResult.rows[0];
    if (!admin) {
      return { success: false, errorCode: 'ADMIN_NOT_FOUND' };
    }

    await client.query(
      `UPDATE employees
       SET password_hash = extensions.crypt($1, extensions.gen_salt('bf')),
           updated_at = now()
       WHERE id = $2`,
      [newPassword, admin.id]
    );

    await client.query(
      `UPDATE tenants
       SET admin_employee_id = COALESCE(admin_employee_id, $1), updated_at = now()
       WHERE id = $2`,
      [admin.id, input.tenantId]
    );

    return {
      success: true,
      adminEmployeeId: admin.id,
      adminUsername: admin.username,
      adminRealName: admin.real_name,
    };
  });
}

export async function setTenantSuperAdminRepository(employeeId: string): Promise<TenantMutationResult> {
  return withPgTransaction(async (client) => {
    const employeeResult = await client.query<{ id: string; tenant_id: string | null }>(
      'SELECT id, tenant_id FROM employees WHERE id = $1 LIMIT 1',
      [employeeId]
    );
    const employee = employeeResult.rows[0];
    if (!employee?.tenant_id) {
      return { success: false, errorCode: 'EMPLOYEE_NOT_FOUND' };
    }

    await client.query(
      'UPDATE employees SET is_super_admin = false WHERE tenant_id = $1 AND id <> $2',
      [employee.tenant_id, employeeId]
    );
    await client.query(
      'UPDATE employees SET is_super_admin = true, updated_at = now() WHERE id = $1',
      [employeeId]
    );
    await client.query(
      'UPDATE tenants SET admin_employee_id = $1, updated_at = now() WHERE id = $2',
      [employeeId, employee.tenant_id]
    );
    return { success: true };
  });
}

export async function syncAuthPasswordViaEdgeRepository(
  username: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  const supabaseUrl = config.supabase.url;
  const anonKey = config.supabase.anonKey;
  if (!supabaseUrl || !anonKey) {
    return { success: false, message: 'Supabase config missing' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-auth-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ username, password }),
    });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!response.ok || data.success === false) {
      return { success: false, message: data.message || `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteTenantRepository(input: {
  tenantId: string;
  force?: boolean;
}): Promise<TenantMutationResult> {
  return withPgTransaction(async (client) => {
    const tenantResult = await client.query<{ tenant_code: string }>(
      'SELECT tenant_code FROM tenants WHERE id = $1 LIMIT 1',
      [input.tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      return { success: false, errorCode: 'TENANT_NOT_FOUND' };
    }
    if (tenant.tenant_code === 'platform') {
      return { success: false, errorCode: 'CANNOT_DELETE_PLATFORM' };
    }

    const dataRows = await client.query<{ table_name: string }>(
      `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'tenant_id'
         AND table_name NOT IN ('tenants', 'employees', 'navigation_config', 'role_permissions')
       ORDER BY table_name`
    );

    let dataCount = 0;
    const dataDetails: string[] = [];
    for (const row of dataRows.rows) {
      try {
        const countResult = await client.query<{ count: string }>(
          `SELECT COUNT(*)::int AS count FROM public.${row.table_name} WHERE tenant_id = $1`,
          [input.tenantId]
        );
        const count = Number(countResult.rows[0]?.count ?? 0);
        if (count > 0) {
          dataCount += count;
          dataDetails.push(`${row.table_name}(${count})`);
        }
      } catch {
        // ignore unknown tables or incompatible schemas
      }
    }

    if (dataCount > 0 && !input.force) {
      return {
        success: false,
        errorCode: 'TENANT_HAS_DATA',
        message: `共 ${dataCount} 条业务数据: ${dataDetails.join(', ')}`,
      };
    }

    await client.query('UPDATE tenants SET admin_employee_id = null WHERE id = $1', [input.tenantId]);
    await client.query(
      `UPDATE profiles SET employee_id = null
       WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );

    await client.query(
      `DELETE FROM operation_logs
       WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `UPDATE operation_logs SET restored_by = null
       WHERE restored_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `DELETE FROM activity_gifts
       WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `UPDATE audit_records SET reviewer_id = null
       WHERE reviewer_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `UPDATE audit_records SET submitter_id = null
       WHERE submitter_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `UPDATE employee_name_history SET changed_by = null
       WHERE changed_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `DELETE FROM points_ledger
       WHERE order_id IN (
         SELECT o.id
         FROM orders o
         WHERE o.creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR o.sales_user_id IN (SELECT id FROM employees WHERE tenant_id = $1)
       )`,
      [input.tenantId]
    );
    await client.query(
      `DELETE FROM orders
       WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
          OR sales_user_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `WITH doomed_members AS (
         SELECT id
         FROM members
         WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR recorder_id IN (SELECT id FROM employees WHERE tenant_id = $1)
       )
       DELETE FROM member_activity
       WHERE member_id IN (SELECT id FROM doomed_members)`,
      [input.tenantId]
    );
    await client.query(
      `WITH doomed_members AS (
         SELECT id
         FROM members
         WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR recorder_id IN (SELECT id FROM employees WHERE tenant_id = $1)
       )
       DELETE FROM activity_gifts
       WHERE member_id IN (SELECT id FROM doomed_members)`,
      [input.tenantId]
    );
    await client.query(
      `WITH doomed_members AS (
         SELECT id
         FROM members
         WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR recorder_id IN (SELECT id FROM employees WHERE tenant_id = $1)
       )
       DELETE FROM points_ledger
       WHERE member_id IN (SELECT id FROM doomed_members)`,
      [input.tenantId]
    );
    await client.query(
      `WITH doomed_members AS (
         SELECT id
         FROM members
         WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR recorder_id IN (SELECT id FROM employees WHERE tenant_id = $1)
       )
       UPDATE orders
       SET member_id = null
       WHERE member_id IN (SELECT id FROM doomed_members)`,
      [input.tenantId]
    );
    await client.query(
      `DELETE FROM members
       WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
          OR recorder_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );
    await client.query(
      `DELETE FROM points_ledger
       WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      [input.tenantId]
    );

    const safeStatements = [
      `UPDATE balance_change_logs SET operator_id = null WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE ledger_transactions SET operator_id = null WHERE operator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM api_keys WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM data_backups WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE invitation_codes SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE knowledge_articles SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE knowledge_categories SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM permission_change_logs WHERE changed_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE permission_versions SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM risk_events WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = $1) OR resolved_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM risk_scores WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM shift_handovers WHERE handover_employee_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `DELETE FROM shift_receivers WHERE creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)`,
      `UPDATE webhooks SET created_by = null WHERE created_by IN (SELECT id FROM employees WHERE tenant_id = $1)`,
    ];
    for (const statement of safeStatements) {
      try {
        await client.query(statement, [input.tenantId]);
      } catch {
        // ignore optional tables
      }
    }

    await client.query('DELETE FROM employees WHERE tenant_id = $1', [input.tenantId]);

    const tenantScopedRows = await client.query<{ table_name: string }>(
      `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'tenant_id'
         AND table_name NOT IN ('tenants', 'employees')
       ORDER BY table_name`
    );
    for (const row of tenantScopedRows.rows) {
      try {
        await client.query(`DELETE FROM public.${row.table_name} WHERE tenant_id = $1`, [input.tenantId]);
      } catch {
        // ignore
      }
    }

    await client.query('DELETE FROM tenants WHERE id = $1', [input.tenantId]);
    return { success: true };
  });
}
