/**
 * Stats Repository — 管理仪表盘聚合查询（安全白名单）
 */
import { query, queryOne } from '../../database/index.js';

const ALLOWED_COUNT_TABLES = new Set([
  // 核心业务表
  'orders', 'members', 'employees', 'activity_gifts', 'operation_logs',
  'notifications', 'points_ledger', 'ledger_transactions', 'balance_change_logs',
  'employee_login_logs', 'audit_records', 'error_reports', 'api_request_logs',
  // 归档表
  'archived_orders', 'archived_operation_logs', 'archived_points_ledger',
  // 备份/导出所需表（DR 演练 + 数据导出统计）
  'member_activity', 'points_accounts', 'shared_data_store',
  'referral_relations', 'cards', 'vendors', 'payment_providers',
  'customer_sources', 'activity_types', 'currencies', 'shift_handovers',
  'knowledge_categories', 'knowledge_articles', 'card_types',
  'shift_receivers', 'role_permissions',
]);

export async function getTableRowCounts(
  tables: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const safe = tables.filter((t) => ALLOWED_COUNT_TABLES.has(t));
  await Promise.all(
    safe.map(async (t) => {
      try {
        const row = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`${t}\``,
          [],
        );
        result[t] = Number(row?.cnt ?? 0);
      } catch {
        result[t] = 0;
      }
    }),
  );
  return result;
}

export async function countFilteredRows(
  table: string,
  filters: { column: string; op: string; value: string }[],
): Promise<number> {
  if (!ALLOWED_COUNT_TABLES.has(table)) return 0;
  const allowedCols = new Set([
    'recipient_id', 'is_read', 'created_at', 'tenant_id', 'status',
  ]);
  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const f of filters) {
    if (!allowedCols.has(f.column)) continue;
    if (f.op === 'eq') {
      conditions.push(`\`${f.column}\` = ?`);
      values.push(f.value === 'false' ? 0 : f.value === 'true' ? 1 : f.value);
    } else if (f.op === 'gte') {
      conditions.push(`\`${f.column}\` >= ?`);
      values.push(f.value);
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`${table}\` ${where}`,
      values,
    );
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

export interface ApiLogStatsRow {
  path: string | null;
  response_time_ms: number | null;
  status_code: number | null;
}

export async function getApiLogStatsSince(
  sinceIso: string,
  limit = 10000,
): Promise<{ rows: ApiLogStatsRow[]; total: number }> {
  try {
    const countRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM api_request_logs WHERE created_at >= ?`,
      [sinceIso],
    );
    const total = Number(countRow?.cnt ?? 0);
    const rows = await query<ApiLogStatsRow>(
      `SELECT path, response_time_ms, status_code
       FROM api_request_logs WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
      [sinceIso, limit],
    );
    return { rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}
