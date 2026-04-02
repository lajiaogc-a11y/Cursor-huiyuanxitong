/**
 * 租户数据迁移 RPC — MySQL 实现（与 Supabase 版不等价，覆盖常用收口能力）
 */
import type { ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

const COUNT_TABLES = ['members', 'employees', 'orders', 'activity_gifts'] as const;

/**
 * 多行/租户维度表（含 shared_data_store：uk_shared_data_key 在 store_key）。
 * lottery_* / points_log / uploaded_images / member_operation_logs 由运行时迁移创建，库中无表时计数与 UPDATE 会静默跳过或记入 extra_errors。
 */
const EXTRA_TENANT_TABLES = [
  'webhooks',
  'announcements',
  'site_messages',
  'member_portal_settings_versions',
  'member_spin_wheel_prizes',
  'member_points_mall_items',
  'webhook_event_queue',
  'phone_pool',
  'phone_reservations',
  'task_templates',
  'tasks',
  'merchant_configs',
  'tenant_feature_flags',
  'error_reports',
  'shared_data_store',
  'lottery_prizes',
  'lottery_logs',
  'points_log',
  'uploaded_images',
  'member_operation_logs',
  'knowledge_categories',
  'knowledge_articles',
  'api_keys',
  'points_accounts',
  'points_ledger',
  'gift_cards',
] as const;

/** 每租户至多一行：仅当目标租户尚无记录时才把源租户该行改为目标 tenant_id */
const SINGLETON_TENANT_TABLES = [
  'member_portal_settings',
  'lottery_settings',
  'tenant_maintenance_modes',
  'login_2fa_settings',
] as const;

function migrationAllowed(req: AuthenticatedRequest): boolean {
  if (req.user?.type === 'member' || !req.user) return false;
  return !!(req.user.is_platform_super_admin || req.user.is_super_admin);
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw as T;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function countForTenant(table: string, tenantId: string): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE tenant_id = ?`,
    [tenantId],
  );
  return Number(row?.c ?? 0);
}

async function safeCountForTenant(table: string, tenantId: string): Promise<number> {
  try {
    return await countForTenant(table, tenantId);
  } catch {
    return 0;
  }
}

async function selectExtraByTenant(table: string, source: string, limit: number): Promise<unknown[]> {
  try {
    return await query(`SELECT * FROM \`${table}\` WHERE tenant_id = ? ORDER BY id DESC LIMIT ?`, [source, limit]);
  } catch {
    return [];
  }
}

async function migrateSingletonTenantRow(table: string, source: string, target: string): Promise<number> {
  const src = await queryOne<{ id: string }>(`SELECT id FROM \`${table}\` WHERE tenant_id = ? LIMIT 1`, [source]);
  if (!src?.id) return 0;
  const tgt = await queryOne<{ id: string }>(`SELECT id FROM \`${table}\` WHERE tenant_id = ? LIMIT 1`, [target]);
  if (tgt?.id) return 0;
  const r = await execute(`UPDATE \`${table}\` SET tenant_id = ? WHERE id = ? AND tenant_id = ?`, [
    target,
    src.id,
    source,
  ]);
  return r.affectedRows ?? 0;
}

async function assertTenantPair(source: string, target: string): Promise<void> {
  if (!source || !target || source === target) {
    throw new Error('INVALID_TENANT');
  }
  const rows = await query<{ id: string }>('SELECT id FROM tenants WHERE id IN (?, ?)', [source, target]);
  if (rows.length !== 2) throw new Error('INVALID_TENANT');
}

async function insertMigrationJob(input: {
  source: string;
  target: string;
  operation: string;
  status: string;
  createdBy: string | null;
  progress?: Record<string, unknown> | null;
}): Promise<string> {
  const id = randomUUID();
  const tables_config = JSON.stringify({
    operation: input.operation,
    created_at_server: new Date().toISOString(),
  });
  const progress = input.progress ? JSON.stringify(input.progress) : null;
  await execute(
    `INSERT INTO tenant_migration_jobs (id, source_tenant_id, target_tenant_id, status, tables_config, progress, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.source, input.target, input.status, tables_config, progress, input.createdBy],
  );
  return id;
}

async function updateJobProgress(jobId: string, status: string, progress: Record<string, unknown>): Promise<void> {
  await execute(`UPDATE tenant_migration_jobs SET status = ?, progress = ?, completed_at = NOW(3) WHERE id = ?`, [
    status,
    JSON.stringify(progress),
    jobId,
  ]);
}

async function updateJobFailed(jobId: string, message: string): Promise<void> {
  await execute(`UPDATE tenant_migration_jobs SET status = 'failed', error_message = ?, completed_at = NOW(3) WHERE id = ?`, [
    message.slice(0, 2000),
    jobId,
  ]);
}

async function buildConflictDetails(
  source: string,
  target: string,
  limit: number,
): Promise<{
  success: boolean;
  member_conflicts: unknown[];
  employee_conflicts: unknown[];
  summary: { member_conflict_count: number; employee_conflict_count: number };
}> {
  const memberConflicts = await query(
    `SELECT s.id AS source_member_id, s.member_code, s.phone_number, t.id AS target_member_id
     FROM members s
     INNER JOIN members t
       ON t.tenant_id = ? AND s.tenant_id = ?
       AND s.member_code IS NOT NULL AND TRIM(s.member_code) <> ''
       AND t.member_code = s.member_code AND s.id <> t.id
     LIMIT ?`,
    [target, source, limit],
  );

  const employeeConflicts = await query(
    `SELECT s.id AS source_employee_id, s.username, t.id AS target_employee_id
     FROM employees s
     INNER JOIN employees t
       ON t.tenant_id = ? AND s.tenant_id = ?
       AND s.username = t.username AND s.id <> t.id
     LIMIT ?`,
    [target, source, limit],
  );

  return {
    success: true,
    member_conflicts: memberConflicts,
    employee_conflicts: employeeConflicts,
    summary: {
      member_conflict_count: memberConflicts.length,
      employee_conflict_count: employeeConflicts.length,
    },
  };
}

function mapJobRow(row: Record<string, unknown>, totalCount?: number): Record<string, unknown> {
  const cfg = parseJson<Record<string, unknown>>(row.tables_config, {});
  const rep = parseJson<Record<string, unknown>>(row.progress, {});
  const out: Record<string, unknown> = {
    id: row.id,
    source_tenant_id: row.source_tenant_id,
    target_tenant_id: row.target_tenant_id,
    operation: typeof cfg.operation === 'string' ? cfg.operation : 'UNKNOWN',
    status: row.status,
    report: rep,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
  };
  if (totalCount !== undefined) out.total_count = totalCount;
  return out;
}

export async function tenantMigrationMemberCodeConflictCount(source: string, target: string): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM members s
     INNER JOIN members t
       ON t.tenant_id = ?
       AND s.tenant_id = ?
       AND s.member_code IS NOT NULL AND TRIM(s.member_code) <> ''
       AND t.member_code = s.member_code
       AND s.id <> t.id`,
    [target, source],
  );
  return Number(row?.c ?? 0);
}

export async function tenantMigrationUsernameConflictCount(source: string, target: string): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM employees s
     INNER JOIN employees t
       ON t.tenant_id = ?
       AND s.tenant_id = ?
       AND s.username = t.username
       AND s.id <> t.id`,
    [target, source],
  );
  return Number(row?.c ?? 0);
}

export async function runTenantMigrationRpc(
  fn: string,
  req: AuthenticatedRequest,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!migrationAllowed(req)) {
    return { success: false, message: 'NO_PERMISSION' };
  }

  const userId = req.user?.id ?? null;

  switch (fn) {
      case 'preview_tenant_data_migration': {
        const source = String(params.p_source_tenant_id || '').trim();
        const target = String(params.p_target_tenant_id || '').trim();
        await assertTenantPair(source, target);

        const source_counts: Record<string, number> = {};
        const target_counts: Record<string, number> = {};
        for (const t of COUNT_TABLES) {
          source_counts[t] = await countForTenant(t, source);
          target_counts[t] = await countForTenant(t, target);
        }
        for (const t of EXTRA_TENANT_TABLES) {
          source_counts[t] = await safeCountForTenant(t, source);
          target_counts[t] = await safeCountForTenant(t, target);
        }
        for (const t of SINGLETON_TENANT_TABLES) {
          source_counts[t] = await safeCountForTenant(t, source);
          target_counts[t] = await safeCountForTenant(t, target);
        }

        const member_code_overlap = await tenantMigrationMemberCodeConflictCount(source, target);
        const employee_username_overlap = await tenantMigrationUsernameConflictCount(source, target);
        const conflict_summary = {
          member_code_overlap,
          employee_username_overlap,
        };

        let extra_row_volume = 0;
        for (const t of EXTRA_TENANT_TABLES) {
          extra_row_volume += source_counts[t] ?? 0;
        }

        let risk_level = 'LOW';
        if (member_code_overlap > 0 || employee_username_overlap > 0) risk_level = 'MEDIUM';
        if (source_counts.members > 5000 || source_counts.orders > 20000) risk_level = 'HIGH';
        if (source_counts.activity_gifts > 20000) risk_level = 'HIGH';
        if (extra_row_volume > 100000) risk_level = 'HIGH';

        const payload = {
          source_tenant_id: source,
          target_tenant_id: target,
          source_counts,
          target_counts,
          conflict_summary,
          risk_level,
          extra_row_volume_hint: extra_row_volume,
        };

        await insertMigrationJob({
          source,
          target,
          operation: 'DRY_RUN',
          status: 'success',
          createdBy: userId,
          progress: { preview: payload },
        });

        return payload;
      }

      case 'export_tenant_data_json': {
        const source = String(params.p_source_tenant_id || '').trim();
        const limit = Math.min(20000, Math.max(100, Number(params.p_limit) || 5000));
        if (!source) throw new Error('TENANT_REQUIRED');
        const trow = await queryOne('SELECT id FROM tenants WHERE id = ?', [source]);
        if (!trow) throw new Error('INVALID_TENANT');

        const tailPromises = [
          ...EXTRA_TENANT_TABLES.map((tbl) => selectExtraByTenant(tbl, source, limit)),
          ...SINGLETON_TENANT_TABLES.map((tbl) => selectExtraByTenant(tbl, source, limit)),
        ];
        const [members, employees, orders, activity_gifts, ...tailRows] = await Promise.all([
          query(`SELECT * FROM members WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`, [source, limit]),
          query(
            `SELECT id, username, real_name, role, tenant_id, status, created_at, updated_at FROM employees WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
            [source, limit],
          ),
          query(`SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`, [source, limit]),
          query(`SELECT * FROM activity_gifts WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`, [source, limit]),
          ...tailPromises,
        ]);

        const nExtra = EXTRA_TENANT_TABLES.length;
        const extraRowsList = tailRows.slice(0, nExtra);
        const singletonRowsList = tailRows.slice(nExtra);

        const extended_tables: Record<string, unknown[]> = {};
        EXTRA_TENANT_TABLES.forEach((tbl, i) => {
          extended_tables[tbl] = extraRowsList[i] as unknown[];
        });
        const singleton_tables: Record<string, unknown[]> = {};
        SINGLETON_TENANT_TABLES.forEach((tbl, i) => {
          singleton_tables[tbl] = singletonRowsList[i] as unknown[];
        });

        const bundle = {
          success: true,
          tenant_id: source,
          limit,
          exported_at: new Date().toISOString(),
          members,
          employees,
          orders,
          activity_gifts,
          extended_tables,
          singleton_tables,
        };

        const extendedExportCounts: Record<string, number> = {};
        for (const t of EXTRA_TENANT_TABLES) {
          extendedExportCounts[t] = extended_tables[t]?.length ?? 0;
        }
        const singletonExportCounts: Record<string, number> = {};
        for (const t of SINGLETON_TENANT_TABLES) {
          singletonExportCounts[t] = singleton_tables[t]?.length ?? 0;
        }

        await insertMigrationJob({
          source,
          target: source,
          operation: 'EXPORT',
          status: 'success',
          createdBy: userId,
          progress: {
            export_counts: {
              members: members.length,
              employees: employees.length,
              orders: orders.length,
              activity_gifts: activity_gifts.length,
              extended: extendedExportCounts,
              singleton: singletonExportCounts,
            },
          },
        });

        return bundle;
      }

      case 'get_tenant_migration_conflict_details': {
        const source = String(params.p_source_tenant_id || '').trim();
        const target = String(params.p_target_tenant_id || '').trim();
        const limit = Math.min(5000, Math.max(1, Number(params.p_limit) || 500));
        await assertTenantPair(source, target);
        return buildConflictDetails(source, target, limit);
      }

      case 'execute_tenant_data_migration': {
        const source = String(params.p_source_tenant_id || '').trim();
        const target = String(params.p_target_tenant_id || '').trim();
        const strategy = String(params.p_member_conflict_strategy || 'SKIP').toUpperCase();
        const limit = Math.min(20000, Math.max(1, Number(params.p_limit) || 5000));
        await assertTenantPair(source, target);

        const jobId = await insertMigrationJob({
          source,
          target,
          operation: 'EXECUTE',
          status: 'running',
          createdBy: userId,
          progress: { phase: 'started', strategy },
        });

        const stats = {
          migrated_members: 0,
          skipped_members: 0,
          overwritten_members: 0,
          migrated_employees: 0,
          skipped_employees: 0,
          overwritten_employees: 0,
          migrated_orders: 0,
          skipped_orders: 0,
          migrated_activity_gifts: 0,
          skipped_activity_gifts: 0,
        };

        try {
          await withTransaction(async (conn: PoolConnection) => {
            const [mCandidates] = await conn.query(
              `SELECT s.id FROM members s
               WHERE s.tenant_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM members t
                 WHERE t.tenant_id = ?
                   AND t.member_code IS NOT NULL AND TRIM(t.member_code) <> ''
                   AND s.member_code IS NOT NULL AND TRIM(s.member_code) <> ''
                   AND t.member_code = s.member_code AND t.id <> s.id
               )
               LIMIT ?`,
              [source, target, limit],
            );
            const mIds = (mCandidates as { id: string }[]).map((r) => r.id);
            if (mIds.length > 0) {
              const ph = mIds.map(() => '?').join(',');
              const [r] = await conn.query(
                `UPDATE members SET tenant_id = ? WHERE id IN (${ph}) AND tenant_id = ?`,
                [target, ...mIds, source],
              );
              stats.migrated_members = (r as ResultSetHeader).affectedRows ?? mIds.length;
            }

            const [eCandidates] = await conn.query(
              `SELECT s.id FROM employees s
               WHERE s.tenant_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM employees t
                 WHERE t.tenant_id = ? AND t.username = s.username AND t.id <> s.id
               )
               LIMIT ?`,
              [source, target, limit],
            );
            const eIds = (eCandidates as { id: string }[]).map((r) => r.id);
            if (eIds.length > 0) {
              const ph = eIds.map(() => '?').join(',');
              const [r] = await conn.query(
                `UPDATE employees SET tenant_id = ? WHERE id IN (${ph}) AND tenant_id = ?`,
                [target, ...eIds, source],
              );
              stats.migrated_employees = (r as ResultSetHeader).affectedRows ?? eIds.length;
            }

            const [oRes] = await conn.query(
              `UPDATE orders SET tenant_id = ? WHERE tenant_id = ? LIMIT ?`,
              [target, source, limit],
            );
            stats.migrated_orders = (oRes as ResultSetHeader).affectedRows ?? 0;

            const [gRes] = await conn.query(
              `UPDATE activity_gifts SET tenant_id = ? WHERE tenant_id = ? LIMIT ?`,
              [target, source, limit],
            );
            stats.migrated_activity_gifts = (gRes as ResultSetHeader).affectedRows ?? 0;
          });
        } catch (err) {
          await updateJobFailed(jobId, (err as Error).message || 'EXECUTE_FAILED');
          throw err;
        }

        const extra_migrated: Record<string, number> = {};
        const extra_errors: Record<string, string> = {};
        for (const tbl of EXTRA_TENANT_TABLES) {
          try {
            const r = await execute(
              `UPDATE \`${tbl}\` SET tenant_id = ? WHERE tenant_id = ? LIMIT ?`,
              [target, source, limit],
            );
            extra_migrated[tbl] = r.affectedRows ?? 0;
          } catch (e) {
            extra_errors[tbl] = ((e as Error).message || String(e)).slice(0, 300);
          }
        }

        const singleton_migrated: Record<string, number> = {};
        const singleton_errors: Record<string, string> = {};
        for (const tbl of SINGLETON_TENANT_TABLES) {
          try {
            singleton_migrated[tbl] = await migrateSingletonTenantRow(tbl, source, target);
          } catch (e) {
            singleton_errors[tbl] = ((e as Error).message || String(e)).slice(0, 300);
          }
        }

        const memConflictLeft = await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM members s
           WHERE s.tenant_id = ? AND EXISTS (
             SELECT 1 FROM members t
             WHERE t.tenant_id = ?
               AND t.member_code IS NOT NULL AND TRIM(t.member_code) <> ''
               AND s.member_code IS NOT NULL AND TRIM(s.member_code) <> ''
               AND t.member_code = s.member_code AND t.id <> s.id
           )`,
          [source, target],
        );
        stats.skipped_members = Number(memConflictLeft?.c ?? 0);

        const empConflictLeft = await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM employees s
           WHERE s.tenant_id = ? AND EXISTS (
             SELECT 1 FROM employees t
             WHERE t.tenant_id = ? AND t.username = s.username AND t.id <> s.id
           )`,
          [source, target],
        );
        stats.skipped_employees = Number(empConflictLeft?.c ?? 0);

        await updateJobProgress(jobId, 'success', {
          ...stats,
          extra_migrated,
          singleton_migrated,
          ...(Object.keys(extra_errors).length ? { extra_errors } : {}),
          ...(Object.keys(singleton_errors).length ? { singleton_errors } : {}),
          strategy_note:
            strategy === 'OVERWRITE'
              ? 'OVERWRITE 在 MySQL 版与 SKIP 相同（不删除目标租户数据）'
              : undefined,
        });

        return {
          job_id: jobId,
          migrated_members: stats.migrated_members,
          overwritten_members: 0,
          skipped_members: stats.skipped_members,
          migrated_employees: stats.migrated_employees,
          overwritten_employees: 0,
          skipped_employees: stats.skipped_employees,
          migrated_orders: stats.migrated_orders,
          skipped_orders: 0,
          migrated_activity_gifts: stats.migrated_activity_gifts,
          message: 'OK',
          extra_migrated,
          singleton_migrated,
          ...(Object.keys(extra_errors).length ? { extra_errors } : {}),
          ...(Object.keys(singleton_errors).length ? { singleton_errors } : {}),
        };
      }

      case 'rollback_tenant_migration_job': {
        const jobId = String(params.p_job_id || '').trim();
        if (!jobId) throw new Error('JOB_REQUIRED');
        const job = await queryOne<Record<string, unknown>>('SELECT * FROM tenant_migration_jobs WHERE id = ?', [jobId]);
        if (!job) throw new Error('JOB_NOT_FOUND');
        await execute(`UPDATE tenant_migration_jobs SET status = 'rolled_back', error_message = ? WHERE id = ?`, [
          'MySQL: no row-level rollback captured; restore from backup if needed.',
          jobId,
        ]);
        return {
          success: true,
          restored: 0,
          message:
            'ROLLBACK_MARKED_ONLY: tenant_migration_rollbacks 未写入逐行快照时无法自动还原数据，请使用数据库备份恢复。',
        };
      }

      case 'verify_tenant_migration_job': {
        const jobId = String(params.p_job_id || '').trim();
        if (!jobId) throw new Error('JOB_REQUIRED');
        const job = await queryOne<Record<string, unknown>>('SELECT * FROM tenant_migration_jobs WHERE id = ?', [jobId]);
        if (!job) throw new Error('JOB_NOT_FOUND');
        const cfg = parseJson<Record<string, unknown>>(job.tables_config, {});
        const prog = parseJson<Record<string, unknown>>(job.progress, {});
        const source = String(job.source_tenant_id || '');
        const target = String(job.target_tenant_id || '');
        const verification: Record<string, unknown> = {
          job_id: jobId,
          operation: cfg.operation,
          job_status: job.status,
          progress_snapshot: prog,
        };
        if (source && target) {
          const extra_source: Record<string, number> = {};
          const extra_target: Record<string, number> = {};
          for (const t of EXTRA_TENANT_TABLES) {
            extra_source[t] = await safeCountForTenant(t, source);
            extra_target[t] = await safeCountForTenant(t, target);
          }
          const singleton_source: Record<string, number> = {};
          const singleton_target: Record<string, number> = {};
          for (const t of SINGLETON_TENANT_TABLES) {
            singleton_source[t] = await safeCountForTenant(t, source);
            singleton_target[t] = await safeCountForTenant(t, target);
          }
          verification.current_counts = {
            source_members: await countForTenant('members', source),
            target_members: await countForTenant('members', target),
            source_employees: await countForTenant('employees', source),
            target_employees: await countForTenant('employees', target),
            source_orders: await countForTenant('orders', source),
            target_orders: await countForTenant('orders', target),
            source_activity_gifts: await countForTenant('activity_gifts', source),
            target_activity_gifts: await countForTenant('activity_gifts', target),
            extra_tables: { source: extra_source, target: extra_target },
            singleton_tables: { source: singleton_source, target: singleton_target },
          };
        }
        return { success: true, verification };
      }

      case 'export_tenant_migration_audit_bundle': {
        const jobId = String(params.p_job_id || '').trim();
        const conflictLimit = Math.min(5000, Math.max(1, Number(params.p_conflict_limit) || 2000));
        if (!jobId) throw new Error('JOB_REQUIRED');
        const job = await queryOne<Record<string, unknown>>('SELECT * FROM tenant_migration_jobs WHERE id = ?', [jobId]);
        if (!job) throw new Error('JOB_NOT_FOUND');
        const source = String(job.source_tenant_id || '');
        const target = String(job.target_tenant_id || '');
        let conflicts: unknown = null;
        if (source && target && source !== target) {
          conflicts = await buildConflictDetails(source, target, conflictLimit);
        }
        return {
          success: true,
          job: mapJobRow(job),
          conflicts,
          exported_at: new Date().toISOString(),
        };
      }

      case 'list_tenant_migration_jobs': {
        const lim = Math.min(500, Math.max(1, Number(params.p_limit) || 100));
        const rows = await query<Record<string, unknown>>(
          `SELECT * FROM tenant_migration_jobs ORDER BY created_at DESC LIMIT ?`,
          [lim],
        );
        return rows.map((r) => mapJobRow(r));
      }

      case 'list_tenant_migration_jobs_v2': {
        const page = Math.max(1, Number(params.p_page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(params.p_page_size) || 20));
        const offset = (page - 1) * pageSize;
        const op = params.p_operation ? String(params.p_operation).trim() : '';
        const st = params.p_status ? String(params.p_status).trim() : '';

        const where: string[] = ['1=1'];
        const vals: unknown[] = [];
        if (st) {
          where.push('status = ?');
          vals.push(st);
        }
        if (op) {
          where.push(`JSON_UNQUOTE(JSON_EXTRACT(tables_config, '$.operation')) = ?`);
          vals.push(op);
        }
        const wsql = where.join(' AND ');

        const totalRow = await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM tenant_migration_jobs WHERE ${wsql}`,
          vals,
        );
        const total = Number(totalRow?.c ?? 0);

        const rows = await query<Record<string, unknown>>(
          `SELECT * FROM tenant_migration_jobs WHERE ${wsql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        );

        return rows.map((r, i) => mapJobRow(r, i === 0 ? total : undefined));
      }

      default:
        return null;
    }
}
