/**
 * Data repository — audit_records
 */
import { query } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

export interface AuditRecordRow {
  id: string;
  target_table: string;
  target_id: string;
  action_type: string;
  old_data: unknown;
  new_data: unknown;
  submitter_id: string | null;
  reviewer_id: string | null;
  review_time: string | null;
  review_comment: string | null;
  status: string;
  created_at: string;
  submitter_name?: string;
  reviewer_name?: string;
}

export async function listAuditRecordsRepository(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
  searchTerm?: string;
}): Promise<{ data: AuditRecordRow[]; count: number }> {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    conditions.push(`ar.status = ?`);
    values.push(params.status);
  }
  if (params.dateFrom) {
    conditions.push(`ar.created_at >= ?`);
    values.push(toMySqlDatetime(params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(`ar.created_at <= ?`);
    values.push(toMySqlDatetime(params.dateTo));
  }
  if (params.tenantId) {
    conditions.push(`ar.submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)`);
    values.push(params.tenantId);
  }
  if (params.searchTerm?.trim()) {
    const term = `%${params.searchTerm.trim()}%`;
    conditions.push(`(se.real_name LIKE ? OR ar.target_table LIKE ? OR ar.target_id LIKE ? OR CAST(ar.old_data AS CHAR) LIKE ? OR CAST(ar.new_data AS CHAR) LIKE ?)`);
    values.push(term, term, term, term, term);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM audit_records ar ${whereClause}`,
    values
  );
  const rows = await query<AuditRecordRow>(
    `SELECT
       ar.id, ar.target_table, ar.target_id, ar.action_type, ar.old_data, ar.new_data,
       ar.submitter_id, ar.reviewer_id, ar.review_time, ar.review_comment, ar.status, ar.created_at,
       COALESCE(se.real_name, '-') AS submitter_name,
       COALESCE(re.real_name, '-') AS reviewer_name
     FROM audit_records ar
     LEFT JOIN employees se ON se.id = ar.submitter_id
     LEFT JOIN employees re ON re.id = ar.reviewer_id
     ${whereClause}
     ORDER BY ar.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );
  return { data: rows, count: Number(countRows[0]?.count ?? 0) };
}

export async function countPendingAuditRecordsRepository(tenantId?: string | null): Promise<number> {
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  if (tid) {
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM audit_records WHERE status = 'pending' AND submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [tid],
    );
    return Number(rows[0]?.count ?? 0);
  }
  const rowsAll = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM audit_records WHERE status = 'pending'`,
  );
  return Number(rowsAll[0]?.count ?? 0);
}
