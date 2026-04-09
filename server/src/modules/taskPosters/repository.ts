/**
 * 海报库 Repository — 纯数据访问层
 */
import { query, queryOne, execute } from '../../database/index.js';

export interface TaskPosterRow {
  id: string;
  tenant_id: string;
  title: string | null;
  data_url: string | null;
  source_page: string | null;
  created_by: string | null;
  created_at: string;
}

let _tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await query('SELECT 1 FROM task_posters LIMIT 1');
    _tableEnsured = true;
  } catch (_) {
    await execute(`
      CREATE TABLE IF NOT EXISTS task_posters (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        title VARCHAR(500) NULL,
        data_url LONGTEXT NULL,
        source_page VARCHAR(255) NULL DEFAULT 'exchange_rate',
        created_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_task_posters_tenant (tenant_id),
        KEY idx_task_posters_created (tenant_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    _tableEnsured = true;
  }
}

export async function savePoster(
  tenantId: string,
  employeeId: string,
  dataUrl: string,
  title?: string
): Promise<{ id: string }> {
  await ensureTable();
  const id = (await import('crypto')).randomUUID();
  await execute(
    `INSERT INTO task_posters (id, tenant_id, title, data_url, source_page, created_by, created_at)
     VALUES (?, ?, ?, ?, 'exchange_rate', ?, CURRENT_TIMESTAMP(3))`,
    [id, tenantId, title || null, dataUrl, employeeId]
  );
  return { id };
}

export async function getPosters(tenantId: string): Promise<TaskPosterRow[]> {
  await ensureTable();
  return query<TaskPosterRow>(
    `SELECT id, tenant_id, title, data_url, source_page, created_by, created_at
     FROM task_posters
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 200`,
    [tenantId]
  );
}

export async function updatePoster(
  posterId: string,
  tenantId: string,
  updates: { title?: string }
): Promise<boolean> {
  await ensureTable();
  if (updates.title !== undefined) {
    const result = await execute(
      `UPDATE task_posters SET title = ? WHERE id = ? AND tenant_id = ?`,
      [updates.title, posterId, tenantId]
    );
    return (result as any)?.affectedRows > 0;
  }
  return false;
}

export async function deletePoster(posterId: string, tenantId: string): Promise<boolean> {
  await ensureTable();
  const result = await execute(
    `DELETE FROM task_posters WHERE id = ? AND tenant_id = ?`,
    [posterId, tenantId]
  );
  return (result as any)?.affectedRows > 0;
}
