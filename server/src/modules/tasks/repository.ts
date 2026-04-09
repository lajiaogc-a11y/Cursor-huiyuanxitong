/**
 * Tasks Repository — tasks / task_items 表的唯一 DB 层
 */
import { query, execute } from '../../database/index.js';

// ── Schema helpers ──

async function ensureMaintenanceColumnsOnTasksTable(): Promise<void> {
  try {
    const colRows = await query<Record<string, string>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'`,
    );
    const names = new Set(
      colRows.map((r) => String(r.COLUMN_NAME ?? r.column_name ?? '').toLowerCase()).filter(Boolean),
    );
    if (!names.has('total_items')) {
      await execute(
        `ALTER TABLE tasks ADD COLUMN total_items INT NOT NULL DEFAULT 0 COMMENT '维护任务：子项条数'`,
      );
    }
    if (!names.has('source_page')) {
      await execute(
        `ALTER TABLE tasks ADD COLUMN source_page VARCHAR(255) NULL COMMENT '维护任务：来源页面'`,
      );
    }
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (!msg.includes('Duplicate column name')) {
      console.warn('[tasks] ensureMaintenanceColumnsOnTasksTable:', msg);
    }
  }
}

async function ensureTaskItemsPosterColumn(): Promise<void> {
  try {
    const colRows = await query<Record<string, string>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_items'`,
    );
    const names = new Set(
      colRows.map((r) => String(r.COLUMN_NAME ?? '').toLowerCase()).filter(Boolean),
    );
    if (!names.has('poster_id')) {
      await execute(
        `ALTER TABLE task_items ADD COLUMN poster_id CHAR(36) NULL COMMENT '发动态海报 task_posters.id' AFTER phone`,
      );
    }
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (!msg.includes('Duplicate column name')) {
      console.warn('[tasks] ensureTaskItemsPosterColumn:', msg);
    }
  }
}

export async function ensureTasksTablesAndItemsRepository(): Promise<void> {
  try {
    await query('SELECT 1 FROM tasks LIMIT 1');
    await ensureMaintenanceColumnsOnTasksTable();
  } catch (_) {
    await execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        template_id CHAR(36) NULL,
        title VARCHAR(500) NOT NULL,
        total_items INT NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        source_page VARCHAR(255) NULL,
        created_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_tasks_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  try {
    await query('SELECT 1 FROM task_items LIMIT 1');
    await ensureTaskItemsPosterColumn();
  } catch (_) {
    await execute(`
      CREATE TABLE IF NOT EXISTS task_items (
        id CHAR(36) NOT NULL PRIMARY KEY,
        task_id CHAR(36) NOT NULL,
        assigned_to CHAR(36) NULL,
        phone VARCHAR(100) NULL,
        poster_id CHAR(36) NULL,
        remark TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'todo',
        channel VARCHAR(100) NULL,
        updated_by CHAR(36) NULL,
        updated_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_task_items_task (task_id),
        KEY idx_task_items_assigned (assigned_to)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureTaskItemsPosterColumn();
  }
}

// ── Queries ──

export async function queryTradedMembersInRange(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<{ member_id: string | null; phone: string | null }[]> {
  return query<{ member_id: string | null; phone: string | null }>(
    `SELECT DISTINCT
       o.member_id,
       COALESCE(o.phone_number, m.phone_number) AS phone
     FROM orders o
     LEFT JOIN members m ON m.id = o.member_id
     WHERE o.tenant_id = ?
       AND o.status IN ('completed', 'pending')
       AND COALESCE(o.is_deleted, 0) = 0
       AND o.created_at >= ?
       AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [tenantId, startDate, endDate],
  );
}

export async function queryAllActiveMembersWithLastTx(
  tenantId: string,
): Promise<{ id: string; phone_number: string; name: string | null; last_tx: string | null }[]> {
  return query<{ id: string; phone_number: string; name: string | null; last_tx: string | null }>(
    `SELECT m.id, m.phone_number, m.name,
       (SELECT MAX(o2.created_at) FROM orders o2
        WHERE (o2.member_id = m.id OR o2.phone_number = m.phone_number)
          AND o2.tenant_id = ?
          AND COALESCE(o2.is_deleted, 0) = 0
       ) AS last_tx
     FROM members m
     WHERE m.tenant_id = ?
       AND m.status = 'active'
     ORDER BY m.created_at DESC`,
    [tenantId, tenantId],
  );
}

export async function insertTaskRepository(params: {
  id: string;
  tenantId: string;
  title: string;
  totalItems: number;
  sourcePage: string;
  createdBy: string;
}): Promise<void> {
  await execute(
    `INSERT INTO tasks (id, tenant_id, title, total_items, status, source_page, created_by, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, CURRENT_TIMESTAMP(3))`,
    [params.id, params.tenantId, params.title, params.totalItems, params.sourcePage, params.createdBy],
  );
}

export async function insertTaskItemsBatchRepository(
  values: { id: string; taskId: string; assignedTo: string; phone: string }[],
): Promise<void> {
  if (values.length === 0) return;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (const v of values) {
    placeholders.push("(?, ?, ?, ?, 'todo', CURRENT_TIMESTAMP(3))");
    params.push(v.id, v.taskId, v.assignedTo, v.phone);
  }
  await execute(
    `INSERT INTO task_items (id, task_id, assigned_to, phone, status, created_at) VALUES ${placeholders.join(', ')}`,
    params,
  );
}

export async function insertPosterTaskItemRepository(params: {
  id: string;
  taskId: string;
  assignedTo: string;
  posterId: string;
}): Promise<void> {
  await execute(
    `INSERT INTO task_items (id, task_id, assigned_to, phone, poster_id, status, created_at)
     VALUES (?, ?, ?, NULL, ?, 'todo', CURRENT_TIMESTAMP(3))`,
    [params.id, params.taskId, params.assignedTo, params.posterId],
  );
}

export async function queryPosterIdsByTenant(
  tenantId: string,
  posterIds: string[],
): Promise<{ id: string }[]> {
  const placeholders = posterIds.map(() => '?').join(',');
  return query<{ id: string }>(
    `SELECT id FROM task_posters WHERE tenant_id = ? AND id IN (${placeholders})`,
    [tenantId, ...posterIds],
  );
}

export async function queryOpenTasksRepository(
  tenantId: string,
): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  return query<{ id: string; title: string; created_at: string; total_items: number }>(
    `SELECT id, title, created_at, total_items
     FROM tasks
     WHERE tenant_id = ? AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 100`,
    [tenantId],
  );
}

export async function closeTaskRepository(taskId: string, tenantId: string): Promise<number> {
  const result = await execute(
    `UPDATE tasks SET status = 'closed' WHERE id = ? AND tenant_id = ?`,
    [taskId, tenantId],
  );
  return (result as { affectedRows?: number })?.affectedRows ?? 0;
}

export async function queryTaskProgressRows(
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  return query<Record<string, unknown>>(sql, params);
}

export async function queryMyTaskItemRows(
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  return query<Record<string, unknown>>(sql, params);
}

export async function updateTaskItemRemarkRepository(
  tenantId: string,
  employeeId: string,
  itemId: string,
  remark: string,
): Promise<boolean> {
  const result = await execute(
    `UPDATE task_items ti
     INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
     SET ti.remark = ?, ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
     WHERE ti.id = ? AND ti.assigned_to = ?`,
    [tenantId, remark, employeeId, itemId, employeeId],
  );
  return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
}

export async function markTaskItemDoneRepository(
  tenantId: string,
  employeeId: string,
  itemId: string,
  remark?: string | null,
): Promise<boolean> {
  if (remark != null && remark !== '') {
    const result = await execute(
      `UPDATE task_items ti
       INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
       SET ti.status = 'done', ti.remark = ?, ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
       WHERE ti.id = ? AND ti.assigned_to = ? AND ti.status <> 'done'`,
      [tenantId, remark, employeeId, itemId, employeeId],
    );
    return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
  }
  const result = await execute(
    `UPDATE task_items ti
     INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
     SET ti.status = 'done', ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
     WHERE ti.id = ? AND ti.assigned_to = ? AND ti.status <> 'done'`,
    [tenantId, employeeId, itemId, employeeId],
  );
  return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
}
