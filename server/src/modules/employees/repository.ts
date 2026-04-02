/**
 * Employees Repository - 员工管理数据访问
 */
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../../database/index.js';
import { getPool } from '../../database/index.js';

export interface EmployeeRow {
  id: string;
  username: string;
  real_name: string;
  role: 'admin' | 'manager' | 'staff';
  status: 'active' | 'disabled' | 'pending';
  visible: boolean;
  is_super_admin: boolean;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NameHistoryRow {
  id: string;
  employee_id: string;
  old_name: string;
  new_name: string;
  changed_by: string | null;
  changed_by_name: string;
  changed_at: string;
  reason: string | null;
}

export interface EmployeeUniqueCheckResult {
  usernameExists: boolean;
  realNameExists: boolean;
}

export interface CreateEmployeeRepositoryInput {
  tenantId: string;
  username: string;
  real_name: string;
  role: 'admin' | 'manager' | 'staff';
  password: string;
}

export interface UpdateEmployeeRepositoryInput {
  username?: string;
  real_name?: string;
  role?: 'admin' | 'manager' | 'staff';
  password?: string;
  status?: 'active' | 'disabled' | 'pending';
  visible?: boolean;
}

const PUBLIC_FIELDS = 'id, username, real_name, role, status, visible, is_super_admin, tenant_id, created_at, updated_at';

// ============= Employee Functions =============

export async function listEmployeesRepository(tenantId?: string | null): Promise<EmployeeRow[]> {
  if (tenantId) {
    return await query<EmployeeRow>(
      `SELECT ${PUBLIC_FIELDS} FROM employees WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId]
    );
  }
  return await query<EmployeeRow>(
    `SELECT ${PUBLIC_FIELDS} FROM employees ORDER BY created_at DESC`
  );
}

export async function getEmployeeRepository(id: string): Promise<EmployeeRow | null> {
  return await queryOne<EmployeeRow>(
    `SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ? LIMIT 1`,
    [id]
  );
}

export async function checkEmployeeUniqueRepository(params: {
  username?: string;
  realName?: string;
  excludeId?: string;
}): Promise<EmployeeUniqueCheckResult> {
  const username = params.username?.trim();
  const realName = params.realName?.trim();
  const excludeId = params.excludeId ?? null;

  const [usernameRows, realNameRows] = await Promise.all([
    username
      ? query<{ cnt: number }>(
          excludeId
            ? `SELECT COUNT(*) AS cnt FROM employees WHERE username = ? AND id <> ?`
            : `SELECT COUNT(*) AS cnt FROM employees WHERE username = ?`,
          excludeId ? [username, excludeId] : [username]
        )
      : Promise.resolve([{ cnt: 0 }]),
    realName
      ? query<{ cnt: number }>(
          excludeId
            ? `SELECT COUNT(*) AS cnt FROM employees WHERE real_name = ? AND id <> ?`
            : `SELECT COUNT(*) AS cnt FROM employees WHERE real_name = ?`,
          excludeId ? [realName, excludeId] : [realName]
        )
      : Promise.resolve([{ cnt: 0 }]),
  ]);

  return {
    usernameExists: (usernameRows[0]?.cnt ?? 0) > 0,
    realNameExists: (realNameRows[0]?.cnt ?? 0) > 0,
  };
}

export async function createEmployeeRepository(input: CreateEmployeeRepositoryInput): Promise<EmployeeRow> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const result = await execute(
    `INSERT INTO employees (username, name, real_name, role, password_hash, status, visible, is_super_admin, tenant_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', false, false, ?, NOW(), NOW())`,
    [input.username.trim(), input.real_name.trim(), input.real_name.trim(), input.role, passwordHash, input.tenantId]
  );
  const row = await queryOne<EmployeeRow>(
    `SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = ?`,
    [result.insertId]
  );
  return row!;
}

export async function updateEmployeeRepository(
  id: string,
  updates: UpdateEmployeeRepositoryInput,
  changedById?: string,
  changeReason?: string
): Promise<EmployeeRow | null> {
  const current = await getEmployeeRepository(id);
  if (!current) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.username !== undefined) { fields.push('username = ?'); values.push(updates.username.trim()); }
  if (updates.real_name !== undefined) { fields.push('real_name = ?'); values.push(updates.real_name.trim()); fields.push('name = ?'); values.push(updates.real_name.trim()); }
  if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
  if (updates.password && updates.password.trim()) {
    const passwordHash = await bcrypt.hash(updates.password.trim(), 10);
    fields.push('password_hash = ?');
    values.push(passwordHash);
  }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.visible !== undefined) { fields.push('visible = ?'); values.push(updates.visible); }

  if (fields.length === 0) return current;

  values.push(id);
  await execute(`UPDATE employees SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

  const updated = await getEmployeeRepository(id);

  if (
    updated &&
    updates.real_name !== undefined &&
    current.real_name !== updates.real_name.trim()
  ) {
    await execute(
      `INSERT INTO employee_name_history (employee_id, old_name, new_name, changed_by, changed_at, reason)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [id, current.real_name, updates.real_name.trim(), changedById ?? null, changeReason ?? null]
    );
  }

  return updated;
}

export async function listEmployeeNameHistoryRepository(employeeId: string): Promise<NameHistoryRow[]> {
  return await query<NameHistoryRow>(
    `SELECT
       h.id,
       h.employee_id,
       h.old_name,
       h.new_name,
       h.changed_by,
       COALESCE(e.real_name, '-') AS changed_by_name,
       h.changed_at,
       h.reason
     FROM employee_name_history h
     LEFT JOIN employees e ON e.id = h.changed_by
     WHERE h.employee_id = ?
     ORDER BY h.changed_at DESC`,
    [employeeId]
  );
}

export async function setEmployeePasswordRepository(id: string, password: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password.trim(), 10);
  const result = await execute(
    `UPDATE employees SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
    [passwordHash, id]
  );
  return result.affectedRows > 0;
}

export async function setEmployeeStatusRepository(
  id: string,
  status: 'active' | 'disabled'
): Promise<boolean> {
  const result = await execute(
    `UPDATE employees SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id]
  );
  return result.affectedRows > 0;
}

export async function listActiveVisibleEmployeesRepository(tenantId?: string | null): Promise<Array<{ id: string; real_name: string }>> {
  if (tenantId) {
    return await query<{ id: string; real_name: string }>(
      `SELECT id, real_name FROM employees WHERE status = 'active' AND visible = true AND tenant_id = ? ORDER BY real_name ASC`,
      [tenantId]
    );
  }
  return await query<{ id: string; real_name: string }>(
    `SELECT id, real_name FROM employees WHERE status = 'active' AND visible = true ORDER BY real_name ASC`
  );
}

export async function forceLogoutEmployeeSessionsRepository(employeeId: string, reason?: string | null): Promise<boolean> {
  await execute(
    `INSERT INTO employee_session_controls (employee_id, force_logout_after, force_logout_reason, updated_at)
     VALUES (?, NOW(), ?, NOW())
     ON DUPLICATE KEY UPDATE
       force_logout_after = NOW(),
       force_logout_reason = VALUES(force_logout_reason),
       updated_at = NOW()`,
    [employeeId, reason?.trim() ? reason.trim() : null]
  );
  return true;
}

export async function deleteEmployeeRepository(employeeId: string): Promise<boolean> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`UPDATE profiles SET employee_id = null WHERE employee_id = ?`, [employeeId]);
    await conn.query(`UPDATE tenants SET admin_employee_id = null WHERE admin_employee_id = ?`, [employeeId]);
    await conn.query(`UPDATE operation_logs SET restored_by = null WHERE restored_by = ?`, [employeeId]);
    await conn.query(`DELETE FROM operation_logs WHERE operator_id = ?`, [employeeId]);
    await conn.query(`UPDATE audit_records SET reviewer_id = null WHERE reviewer_id = ?`, [employeeId]);
    await conn.query(`UPDATE audit_records SET submitter_id = null WHERE submitter_id = ?`, [employeeId]);
    await conn.query(`UPDATE employee_name_history SET changed_by = null WHERE changed_by = ?`, [employeeId]);
    await conn.query(`UPDATE members SET creator_id = null WHERE creator_id = ?`, [employeeId]);
    await conn.query(`UPDATE members SET recorder_id = null WHERE recorder_id = ?`, [employeeId]);
    await conn.query(`UPDATE orders SET creator_id = null WHERE creator_id = ?`, [employeeId]);
    await conn.query(`UPDATE orders SET sales_user_id = null WHERE sales_user_id = ?`, [employeeId]);
    await conn.query(`UPDATE activity_gifts SET creator_id = null WHERE creator_id = ?`, [employeeId]);
    await conn.query(`UPDATE points_ledger SET creator_id = null WHERE creator_id = ?`, [employeeId]);

    // 以下表可能不存在，忽略错误
    const safeTables = [
      [`UPDATE balance_change_logs SET operator_id = null WHERE operator_id = ?`, [employeeId]],
      [`UPDATE ledger_transactions SET operator_id = null WHERE operator_id = ?`, [employeeId]],
      [`DELETE FROM api_keys WHERE created_by = ?`, [employeeId]],
      [`DELETE FROM data_backups WHERE created_by = ?`, [employeeId]],
      [`UPDATE invitation_codes SET created_by = null WHERE created_by = ?`, [employeeId]],
      [`UPDATE knowledge_articles SET created_by = null WHERE created_by = ?`, [employeeId]],
      [`UPDATE knowledge_categories SET created_by = null WHERE created_by = ?`, [employeeId]],
      [`DELETE FROM permission_change_logs WHERE changed_by = ?`, [employeeId]],
      [`UPDATE permission_versions SET created_by = null WHERE created_by = ?`, [employeeId]],
      [`DELETE FROM risk_events WHERE employee_id = ? OR resolved_by = ?`, [employeeId, employeeId]],
      [`DELETE FROM risk_scores WHERE employee_id = ?`, [employeeId]],
      [`DELETE FROM shift_handovers WHERE handover_employee_id = ?`, [employeeId]],
      [`DELETE FROM shift_receivers WHERE creator_id = ?`, [employeeId]],
      [`UPDATE webhooks SET created_by = null WHERE created_by = ?`, [employeeId]],
    ] as Array<[string, any[]]>;

    for (const [sql, params] of safeTables) {
      try {
        await conn.query(sql, params as any);
      } catch (err: any) {
        // ER_NO_SUCH_TABLE (1146) or ER_BAD_FIELD_ERROR (1054) — skip
        if (err?.errno === 1146 || err?.errno === 1054) continue;
        throw err;
      }
    }

    const [rows] = await conn.query(`DELETE FROM employees WHERE id = ?`, [employeeId]) as any;
    await conn.commit();
    return (rows?.affectedRows ?? 0) > 0;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
