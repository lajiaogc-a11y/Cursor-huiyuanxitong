/**
 * Employees Repository - 员工管理数据访问
 */
import { supabaseAdmin } from '../../database/index.js';
import { getPgPool, queryPg } from '../../database/pg.js';

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

async function safeClientQuery(client: any, sql: string, params: any[] = []) {
  try {
    await client.query(sql, params);
  } catch (error: any) {
    if (
      error?.code === '42P01' ||
      error?.code === '42703' ||
      error?.message?.includes?.('does not exist')
    ) {
      return;
    }
    throw error;
  }
}

export async function listEmployeesRepository(tenantId?: string | null): Promise<EmployeeRow[]> {
  if (getPgPool()) {
    const rows = tenantId
      ? await queryPg<EmployeeRow>(
          `SELECT ${PUBLIC_FIELDS} FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC`,
          [tenantId]
        )
      : await queryPg<EmployeeRow>(
          `SELECT ${PUBLIC_FIELDS} FROM employees ORDER BY created_at DESC`
        );
    return rows;
  }
  let q = supabaseAdmin
    .from('employees')
    .select(PUBLIC_FIELDS)
    .order('created_at', { ascending: false });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmployeeRow[];
}

export async function getEmployeeRepository(id: string): Promise<EmployeeRow | null> {
  if (getPgPool()) {
    const rows = await queryPg<EmployeeRow>(
      `SELECT ${PUBLIC_FIELDS} FROM employees WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select(PUBLIC_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as EmployeeRow | null) ?? null;
}

export async function checkEmployeeUniqueRepository(params: {
  username?: string;
  realName?: string;
  excludeId?: string;
}): Promise<EmployeeUniqueCheckResult> {
  const username = params.username?.trim();
  const realName = params.realName?.trim();
  const excludeId = params.excludeId ?? null;

  if (getPgPool()) {
    const [usernameRows, realNameRows] = await Promise.all([
      username
        ? queryPg<{ exists: boolean }>(
            `SELECT EXISTS(
               SELECT 1 FROM employees
               WHERE username = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
             ) AS exists`,
            [username, excludeId]
          )
        : Promise.resolve([{ exists: false }]),
      realName
        ? queryPg<{ exists: boolean }>(
            `SELECT EXISTS(
               SELECT 1 FROM employees
               WHERE real_name = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
             ) AS exists`,
            [realName, excludeId]
          )
        : Promise.resolve([{ exists: false }]),
    ]);
    return {
      usernameExists: !!usernameRows[0]?.exists,
      realNameExists: !!realNameRows[0]?.exists,
    };
  }

  const [usernameResult, realNameResult] = await Promise.all([
    username
      ? (() => {
          let q = supabaseAdmin.from('employees').select('id').eq('username', username);
          if (excludeId) q = q.neq('id', excludeId);
          return q.limit(1);
        })()
      : Promise.resolve({ data: [], error: null } as any),
    realName
      ? (() => {
          let q = supabaseAdmin.from('employees').select('id').eq('real_name', realName);
          if (excludeId) q = q.neq('id', excludeId);
          return q.limit(1);
        })()
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (usernameResult.error) throw usernameResult.error;
  if (realNameResult.error) throw realNameResult.error;

  return {
    usernameExists: (usernameResult.data?.length ?? 0) > 0,
    realNameExists: (realNameResult.data?.length ?? 0) > 0,
  };
}

export async function createEmployeeRepository(input: CreateEmployeeRepositoryInput): Promise<EmployeeRow> {
  if (getPgPool()) {
    const rows = await queryPg<EmployeeRow>(
      `INSERT INTO employees (
         username, real_name, role, password_hash, status, visible, is_super_admin, tenant_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, extensions.crypt($4, extensions.gen_salt('bf')),
         'active', false, false, $5, now(), now()
       )
       RETURNING ${PUBLIC_FIELDS}`,
      [input.username.trim(), input.real_name.trim(), input.role, input.password, input.tenantId]
    );
    return rows[0];
  }

  const { data, error } = await supabaseAdmin
    .from('employees')
    .insert({
      username: input.username.trim(),
      real_name: input.real_name.trim(),
      role: input.role,
      password_hash: input.password,
      status: 'active',
      visible: false,
      is_super_admin: false,
      tenant_id: input.tenantId,
    })
    .select(PUBLIC_FIELDS)
    .single();
  if (error) throw error;
  return data as EmployeeRow;
}

export async function updateEmployeeRepository(
  id: string,
  updates: UpdateEmployeeRepositoryInput,
  changedById?: string,
  changeReason?: string
): Promise<EmployeeRow | null> {
  const current = await getEmployeeRepository(id);
  if (!current) return null;

  if (getPgPool()) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.username !== undefined) {
      fields.push(`username = $${idx++}`);
      values.push(updates.username.trim());
    }
    if (updates.real_name !== undefined) {
      fields.push(`real_name = $${idx++}`);
      values.push(updates.real_name.trim());
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(updates.role);
    }
    if (updates.password && updates.password.trim()) {
      fields.push(`password_hash = extensions.crypt($${idx++}, extensions.gen_salt('bf'))`);
      values.push(updates.password);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.visible !== undefined) {
      fields.push(`visible = $${idx++}`);
      values.push(updates.visible);
    }

    if (fields.length === 0) {
      return current;
    }

    values.push(id);
    const rows = await queryPg<EmployeeRow>(
      `UPDATE employees
       SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${idx}
       RETURNING ${PUBLIC_FIELDS}`,
      values
    );
    const updated = rows[0] ?? null;
    if (
      updated &&
      updates.real_name !== undefined &&
      current.real_name !== updates.real_name.trim()
    ) {
      await queryPg(
        `INSERT INTO employee_name_history (employee_id, old_name, new_name, changed_by, changed_at, reason)
         VALUES ($1, $2, $3, $4, now(), $5)`,
        [id, current.real_name, updates.real_name.trim(), changedById ?? null, changeReason ?? null]
      );
    }
    return updated;
  }

  const updateData: Record<string, unknown> = {};
  if (updates.username !== undefined) updateData.username = updates.username.trim();
  if (updates.real_name !== undefined) updateData.real_name = updates.real_name.trim();
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.password && updates.password.trim()) updateData.password_hash = updates.password;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.visible !== undefined) updateData.visible = updates.visible;
  if (Object.keys(updateData).length === 0) return current;

  const { data, error } = await supabaseAdmin
    .from('employees')
    .update(updateData)
    .eq('id', id)
    .select(PUBLIC_FIELDS)
    .maybeSingle();
  if (error) throw error;

  if (
    data &&
    updates.real_name !== undefined &&
    current.real_name !== updates.real_name.trim()
  ) {
    await supabaseAdmin.from('employee_name_history').insert({
      employee_id: id,
      old_name: current.real_name,
      new_name: updates.real_name.trim(),
      changed_by: changedById ?? null,
      reason: changeReason ?? null,
    });
  }

  return (data as EmployeeRow | null) ?? null;
}

export async function listEmployeeNameHistoryRepository(employeeId: string): Promise<NameHistoryRow[]> {
  if (getPgPool()) {
    return await queryPg<NameHistoryRow>(
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
       WHERE h.employee_id = $1
       ORDER BY h.changed_at DESC`,
      [employeeId]
    );
  }

  const { data, error } = await supabaseAdmin
    .from('employee_name_history')
    .select('id, employee_id, old_name, new_name, changed_by, changed_at, reason')
    .eq('employee_id', employeeId)
    .order('changed_at', { ascending: false });
  if (error) throw error;

  const changedByIds = [...new Set((data ?? []).map((row: any) => row.changed_by).filter(Boolean))];
  let changedByMap = new Map<string, string>();
  if (changedByIds.length > 0) {
    const { data: employeesData } = await supabaseAdmin
      .from('employees')
      .select('id, real_name')
      .in('id', changedByIds);
    changedByMap = new Map((employeesData ?? []).map((row: any) => [row.id, row.real_name]));
  }

  return (data ?? []).map((row: any) => ({
    ...row,
    changed_by_name: row.changed_by ? (changedByMap.get(row.changed_by) ?? '-') : '-',
  })) as NameHistoryRow[];
}

export async function setEmployeePasswordRepository(id: string, password: string): Promise<boolean> {
  if (getPgPool()) {
    const rows = await queryPg<{ id: string }>(
      `UPDATE employees
       SET password_hash = extensions.crypt($1, extensions.gen_salt('bf')), updated_at = now()
       WHERE id = $2
       RETURNING id`,
      [password, id]
    );
    return rows.length > 0;
  }
  const { data, error } = await supabaseAdmin
    .from('employees')
    .update({ password_hash: password })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function setEmployeeStatusRepository(
  id: string,
  status: 'active' | 'disabled'
): Promise<boolean> {
  if (getPgPool()) {
    const rows = await queryPg<{ id: string }>(
      `UPDATE employees SET status = $1, updated_at = now() WHERE id = $2 RETURNING id`,
      [status, id]
    );
    return rows.length > 0;
  }
  const { data, error } = await supabaseAdmin
    .from('employees')
    .update({ status })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function listActiveVisibleEmployeesRepository(tenantId?: string | null): Promise<Array<{ id: string; real_name: string }>> {
  if (getPgPool()) {
    const rows = tenantId
      ? await queryPg<{ id: string; real_name: string }>(
          `SELECT id, real_name
           FROM employees
           WHERE status = 'active' AND visible = true AND tenant_id = $1
           ORDER BY real_name ASC`,
          [tenantId]
        )
      : await queryPg<{ id: string; real_name: string }>(
          `SELECT id, real_name
           FROM employees
           WHERE status = 'active' AND visible = true
           ORDER BY real_name ASC`
        );
    return rows;
  }
  let q = supabaseAdmin
    .from('employees')
    .select('id, real_name')
    .eq('status', 'active')
    .eq('visible', true)
    .order('real_name');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; real_name: string }>;
}

export async function forceLogoutEmployeeSessionsRepository(employeeId: string, reason?: string | null): Promise<boolean> {
  if (getPgPool()) {
    await queryPg(
      `INSERT INTO employee_session_controls (employee_id, force_logout_after, force_logout_reason, updated_at)
       VALUES ($1, now(), $2, now())
       ON CONFLICT (employee_id)
       DO UPDATE SET
         force_logout_after = EXCLUDED.force_logout_after,
         force_logout_reason = EXCLUDED.force_logout_reason,
         updated_at = now()`,
      [employeeId, reason?.trim() ? reason.trim() : null]
    );
    return true;
  }
  const { error } = await supabaseAdmin
    .from('employee_session_controls')
    .upsert({
      employee_id: employeeId,
      force_logout_after: new Date().toISOString(),
      force_logout_reason: reason?.trim() ? reason.trim() : null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return true;
}

export async function deleteEmployeeRepository(employeeId: string): Promise<boolean> {
  const pool = getPgPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE profiles SET employee_id = null WHERE employee_id = $1`, [employeeId]);
      await client.query(`UPDATE tenants SET admin_employee_id = null WHERE admin_employee_id = $1`, [employeeId]);
      await client.query(`UPDATE operation_logs SET restored_by = null WHERE restored_by = $1`, [employeeId]);
      await client.query(`DELETE FROM operation_logs WHERE operator_id = $1`, [employeeId]);
      await client.query(`UPDATE audit_records SET reviewer_id = null WHERE reviewer_id = $1`, [employeeId]);
      await client.query(`UPDATE audit_records SET submitter_id = null WHERE submitter_id = $1`, [employeeId]);
      await client.query(`UPDATE employee_name_history SET changed_by = null WHERE changed_by = $1`, [employeeId]);
      await client.query(`UPDATE members SET creator_id = null WHERE creator_id = $1`, [employeeId]);
      await client.query(`UPDATE members SET recorder_id = null WHERE recorder_id = $1`, [employeeId]);
      await client.query(`UPDATE orders SET creator_id = null WHERE creator_id = $1`, [employeeId]);
      await client.query(`UPDATE orders SET sales_user_id = null WHERE sales_user_id = $1`, [employeeId]);
      await client.query(`UPDATE activity_gifts SET creator_id = null WHERE creator_id = $1`, [employeeId]);
      await client.query(`UPDATE points_ledger SET creator_id = null WHERE creator_id = $1`, [employeeId]);

      await safeClientQuery(client, `UPDATE balance_change_logs SET operator_id = null WHERE operator_id = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE ledger_transactions SET operator_id = null WHERE operator_id = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM api_keys WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM data_backups WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE invitation_codes SET created_by = null WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE knowledge_articles SET created_by = null WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE knowledge_categories SET created_by = null WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM permission_change_logs WHERE changed_by = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE permission_versions SET created_by = null WHERE created_by = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM risk_events WHERE employee_id = $1 OR resolved_by = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM risk_scores WHERE employee_id = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM shift_handovers WHERE handover_employee_id = $1`, [employeeId]);
      await safeClientQuery(client, `DELETE FROM shift_receivers WHERE creator_id = $1`, [employeeId]);
      await safeClientQuery(client, `UPDATE webhooks SET created_by = null WHERE created_by = $1`, [employeeId]);

      const deleted = await client.query(`DELETE FROM employees WHERE id = $1 RETURNING id`, [employeeId]);
      await client.query('COMMIT');
      return (deleted.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const { error } = await supabaseAdmin.from('employees').delete().eq('id', employeeId);
  if (error) throw error;
  return true;
}
