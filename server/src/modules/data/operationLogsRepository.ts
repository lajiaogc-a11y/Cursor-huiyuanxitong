/**
 * Data repository — operation_logs
 */
import { query, queryOne, execute } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

export interface OperationLogRow {
  id: string;
  timestamp: string;
  operator_id: string | null;
  operator_account: string;
  operator_role: string;
  module: string;
  operation_type: string;
  object_id: string | null;
  object_description: string | null;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  is_restored: boolean;
  restored_by: string | null;
  restored_at: string | null;
}

export interface OperationLogsQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  restoreStatus?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  tenantId?: string | null;
}

export async function listOperationLogsRepository(
  q: OperationLogsQuery & { export?: boolean }
): Promise<{
  data: OperationLogRow[];
  count: number;
  distinctOperators: string[];
  moduleCounts: Record<string, number>;
}> {
  const page = q.page ?? 1;
  const maxPage = q.export ? 10000 : 100;
  const pageSize = Math.min(q.pageSize ?? 50, maxPage);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (q.tenantId) {
    conditions.push(`operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`);
    values.push(q.tenantId);
  }
  if (q.module && q.module !== 'all') {
    conditions.push(`module = ?`);
    values.push(q.module);
  }
  if (q.operationType && q.operationType !== 'all') {
    conditions.push(`operation_type = ?`);
    values.push(q.operationType);
  }
  if (q.operatorAccount && q.operatorAccount !== 'all') {
    conditions.push(`operator_account = ?`);
    values.push(q.operatorAccount);
  }
  if (q.restoreStatus && q.restoreStatus !== 'all') {
    conditions.push(`is_restored = ?`);
    values.push(q.restoreStatus === 'restored');
  }
  if (q.dateStart) {
    conditions.push(`timestamp >= ?`);
    values.push(toMySqlDatetime(q.dateStart));
  }
  if (q.dateEnd) {
    conditions.push(`timestamp <= ?`);
    values.push(toMySqlDatetime(q.dateEnd));
  }
  if (q.searchTerm?.trim()) {
    const term = `%${q.searchTerm.trim()}%`;
    conditions.push(`(operator_account LIKE ? OR object_id LIKE ? OR object_description LIKE ?)`);
    values.push(term, term, term);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows, rows, opRows, modRows] = await Promise.all([
    query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM operation_logs ${whereClause}`,
      values,
    ),
    query<OperationLogRow>(
      `SELECT * FROM operation_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    ),
    query<{ a: string }>(
      `SELECT DISTINCT operator_account AS a FROM operation_logs ${whereClause} ORDER BY a`,
      values,
    ),
    query<{ m: string; c: number }>(
      `SELECT module AS m, COUNT(*) AS c FROM operation_logs ${whereClause} GROUP BY module`,
      values,
    ),
  ]);

  const distinctOperators = opRows.map((r) => r.a).filter(Boolean);
  const moduleCounts: Record<string, number> = {};
  for (const r of modRows) moduleCounts[r.m] = Number(r.c);

  return {
    data: rows,
    count: Number(countRows[0]?.count ?? 0),
    distinctOperators,
    moduleCounts,
  };
}

/**
 * 将操作日志标为已恢复（绕过 tableProxy 对 operation_logs 的 read_only）。
 * - tenant：仅更新属于该租户员工产生的日志（与列表筛选一致）
 * - platform_all：平台超管未选租户时按 id 更新（与列表「全部」一致）
 */
export async function markOperationLogRestoredRepository(
  logId: string,
  restoredById: string | null,
  scope: { kind: 'tenant'; tenantId: string } | { kind: 'platform_all' },
): Promise<number> {
  const rid = restoredById ?? null;
  if (scope.kind === 'platform_all') {
    const r = await execute(
      `UPDATE operation_logs SET is_restored = 1, restored_by = ?, restored_at = NOW(3) WHERE id = ?`,
      [rid, logId],
    );
    return Number(r.affectedRows ?? 0);
  }
  const r = await execute(
    `UPDATE operation_logs SET is_restored = 1, restored_by = ?, restored_at = NOW(3)
     WHERE id = ?
       AND operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
    [rid, logId, scope.tenantId],
  );
  return Number(r.affectedRows ?? 0);
}

export interface InsertOperationLogParams {
  operator_id?: string | null;
  operator_account: string;
  operator_role: string;
  module: string;
  operation_type: string;
  object_id?: string | null;
  object_description?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  ip_address?: string | null;
}

/** JSON 列：已是 JSON 字符串时避免再 stringify 一层（会导致双重编码、界面乱码） */
function serializeJsonColumn(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    try {
      return JSON.stringify(JSON.parse(t));
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

export async function insertOperationLogRepository(params: InsertOperationLogParams): Promise<void> {
  await execute(
    `INSERT INTO operation_logs (
       operator_id, operator_account, operator_role, module, operation_type,
       object_id, object_description, before_data, after_data, ip_address, timestamp
     ) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(3))`,
    [
      params.operator_id ?? null,
      params.operator_account,
      params.operator_role,
      params.module,
      params.operation_type,
      params.object_id ?? null,
      params.object_description ?? null,
      serializeJsonColumn(params.before_data),
      serializeJsonColumn(params.after_data),
      params.ip_address ?? null,
    ]
  );
}
