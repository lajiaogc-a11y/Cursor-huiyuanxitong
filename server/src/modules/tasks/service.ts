/**
 * 客户维护任务服务 - MySQL
 */
import { query, execute } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import { randomUUID } from 'crypto';

/**
 * mysql/schema.sql 中的旧版 tasks 表无 total_items / source_page，
 * 但客户维护「创建并分配」依赖这两列；表已存在时不会走 CREATE TABLE，需在 INSERT 前补齐列。
 */
async function ensureMaintenanceColumnsOnTasksTable(): Promise<void> {
  try {
    const colRows = await query<Record<string, string>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'`
    );
    const names = new Set(
      colRows.map((r) => String(r.COLUMN_NAME ?? r.column_name ?? "").toLowerCase()).filter(Boolean)
    );
    if (!names.has('total_items')) {
      await execute(
        `ALTER TABLE tasks ADD COLUMN total_items INT NOT NULL DEFAULT 0 COMMENT '维护任务：子项条数'`
      );
    }
    if (!names.has('source_page')) {
      await execute(
        `ALTER TABLE tasks ADD COLUMN source_page VARCHAR(255) NULL COMMENT '维护任务：来源页面'`
      );
    }
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (!msg.includes('Duplicate column name')) {
      console.warn('[tasks] ensureMaintenanceColumnsOnTasksTable:', msg);
    }
  }
}

export interface CustomerListResult {
  count: number;
  phones: string[];
  sample: { phone: string; last_tx: string | null }[];
}

export async function generateCustomerList(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<CustomerListResult> {
  const tradedRows = await query<{ member_id: string | null; phone: string | null }>(
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
    [tenantId, toMySqlDatetime(startDate), toMySqlDatetime(endDate)]
  );

  const tradedMemberIds = new Set<string>();
  const tradedPhones = new Set<string>();
  for (const r of tradedRows) {
    if (r.member_id) tradedMemberIds.add(r.member_id);
    if (r.phone) tradedPhones.add(r.phone.replace(/\D/g, ''));
  }

  const allMembers = await query<{
    id: string;
    phone_number: string;
    name: string | null;
    last_tx: string | null;
  }>(
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
    [tenantId, tenantId]
  );

  const untradedPhones: string[] = [];
  const untradedSample: { phone: string; last_tx: string | null }[] = [];

  for (const m of allMembers) {
    const digits = m.phone_number.replace(/\D/g, '');
    if (tradedMemberIds.has(m.id)) continue;
    if (digits && tradedPhones.has(digits)) continue;

    untradedPhones.push(m.phone_number);
    if (untradedSample.length < 50) {
      untradedSample.push({
        phone: m.phone_number,
        last_tx: m.last_tx ? (toMySqlDatetime(new Date(m.last_tx))).slice(0, 10) : null,
      });
    }
  }

  return {
    count: untradedPhones.length,
    phones: untradedPhones,
    sample: untradedSample,
  };
}

/** 旧库若先有 task_items 表但无 poster_id，海报分配 INSERT/SELECT 会失败或查不出，需补列 */
async function ensureTaskItemsPosterColumn(): Promise<void> {
  try {
    const colRows = await query<Record<string, string>>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_items'`,
    );
    const names = new Set(
      colRows.map((r) => String(r.COLUMN_NAME ?? "").toLowerCase()).filter(Boolean),
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

/** 确保 tasks / task_items 表存在（客户维护与海报分配共用） */
async function ensureTasksTablesAndItems(): Promise<void> {
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

export async function createMaintenanceTask(
  tenantId: string,
  createdBy: string,
  title: string,
  phones: string[],
  assignTo: string[],
  distribute: 'even' | 'manual'
): Promise<{ task_id: string; distributed: Record<string, number> }> {
  await ensureTasksTablesAndItems();

  const taskId = randomUUID();
  await execute(
    `INSERT INTO tasks (id, tenant_id, title, total_items, status, source_page, created_by, created_at)
     VALUES (?, ?, ?, ?, 'open', 'maintenance_settings', ?, CURRENT_TIMESTAMP(3))`,
    [taskId, tenantId, title, phones.length, createdBy]
  );

  const distributed: Record<string, number> = {};
  assignTo.forEach((id) => { distributed[id] = 0; });

  if (assignTo.length > 0 && phones.length > 0) {
    const BATCH = 200;
    for (let start = 0; start < phones.length; start += BATCH) {
      const slice = phones.slice(start, start + BATCH);
      const placeholders: string[] = [];
      const params: unknown[] = [];
      for (let i = 0; i < slice.length; i++) {
        const empId = assignTo[(start + i) % assignTo.length];
        placeholders.push('(?, ?, ?, ?, \'todo\', CURRENT_TIMESTAMP(3))');
        params.push(randomUUID(), taskId, empId, slice[i]);
        distributed[empId] = (distributed[empId] || 0) + 1;
      }
      await execute(
        `INSERT INTO task_items (id, task_id, assigned_to, phone, status, created_at) VALUES ${placeholders.join(', ')}`,
        params
      );
    }
  }

  return { task_id: taskId, distributed };
}

/**
 * 发动态（海报）：每张海报一条 task_item，带 poster_id，按员工轮询分配
 */
export async function createPosterDistributionTask(
  tenantId: string,
  createdBy: string,
  title: string,
  posterIds: string[],
  assignTo: string[],
  distribute: 'even' | 'manual'
): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const uniquePosters = [...new Set(posterIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (uniquePosters.length === 0) {
    throw Object.assign(new Error('poster_ids required'), { code: 'VALIDATION_ERROR' });
  }
  if (!assignTo.length) {
    throw Object.assign(new Error('assign_to required'), { code: 'VALIDATION_ERROR' });
  }

  const placeholders = uniquePosters.map(() => '?').join(',');
  let found: { id: string }[];
  try {
    found = await query<{ id: string }>(
      `SELECT id FROM task_posters WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...uniquePosters]
    );
  } catch (e) {
    const msg = String((e as Error)?.message || '');
    if (msg.includes('task_posters') || msg.includes("doesn't exist") || msg.includes('Unknown table')) {
      throw Object.assign(new Error('poster_not_found'), { code: 'POSTER_NOT_FOUND' });
    }
    throw e;
  }
  if (found.length !== uniquePosters.length) {
    throw Object.assign(new Error('poster_not_found'), { code: 'POSTER_NOT_FOUND' });
  }

  await ensureTasksTablesAndItems();

  const taskId = randomUUID();
  await execute(
    `INSERT INTO tasks (id, tenant_id, title, total_items, status, source_page, created_by, created_at)
     VALUES (?, ?, ?, ?, 'open', 'tasks_posters', ?, CURRENT_TIMESTAMP(3))`,
    [taskId, tenantId, title, uniquePosters.length, createdBy]
  );

  const distributed: Record<string, number> = {};
  assignTo.forEach((id) => {
    distributed[id] = 0;
  });

  // 与维护任务一致：仅 even 有明确语义；manual 未实现时仍按轮询分配，避免产生无子项的空任务
  if (assignTo.length > 0) {
    for (let i = 0; i < uniquePosters.length; i++) {
      const empId = assignTo[i % assignTo.length];
      const itemId = randomUUID();
      await execute(
        `INSERT INTO task_items (id, task_id, assigned_to, phone, poster_id, status, created_at)
         VALUES (?, ?, ?, NULL, ?, 'todo', CURRENT_TIMESTAMP(3))`,
        [itemId, taskId, empId, uniquePosters[i]]
      );
      distributed[empId] = (distributed[empId] || 0) + 1;
    }
  }

  return { task_id: taskId, distributed };
}

export async function getOpenTasks(
  tenantId: string
): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  try {
    return await query<{ id: string; title: string; created_at: string; total_items: number }>(
      `SELECT id, title, created_at, total_items
       FROM tasks
       WHERE tenant_id = ? AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 100`,
      [tenantId]
    );
  } catch (_) {
    return [];
  }
}

export async function closeTask(taskId: string, tenantId: string): Promise<boolean> {
  try {
    const result = await execute(
      `UPDATE tasks SET status = 'closed' WHERE id = ? AND tenant_id = ?`,
      [taskId, tenantId]
    );
    return (result as any)?.affectedRows > 0;
  } catch (_) {
    return false;
  }
}

/** 维护历史：任务进度列表（按租户 + 可选日期 + 可选员工） */
export interface TaskProgressOverviewRow {
  task_id: string;
  task_title: string;
  created_at: string;
  total: number;
  done: number;
  items: Array<{
    id: string;
    task_item_id: string;
    task_id: string;
    task_title: string;
    display_label: string;
    status: string;
    assigned_to: string | null;
    assignee_name: string | null;
    done_at: string | null;
    remark: string | null;
  }>;
  employeeStats: Array<{ employee_id: string; name: string; done: number; total: number }>;
}

export async function getTaskProgressListForTenant(
  tenantId: string,
  options?: { employeeId?: string | null; startDate?: string; endDate?: string }
): Promise<TaskProgressOverviewRow[]> {
  await ensureTasksTablesAndItems();
  const empFilter = options?.employeeId && options.employeeId !== 'all' ? String(options.employeeId) : null;
  const startStr = options?.startDate?.trim();
  const endStr = options?.endDate?.trim();
  const hasDate = !!(startStr && endStr);

  let startDt = '';
  let endDt = '';
  if (hasDate) {
    startDt = toMySqlDatetime(`${startStr}T00:00:00.000+08:00`);
    endDt = toMySqlDatetime(`${endStr}T23:59:59.999+08:00`);
  }

  const params: unknown[] = [tenantId];
  let dateClause = '';
  if (hasDate) {
    dateClause = ` AND (
      (t.created_at >= ? AND t.created_at <= ?)
      OR EXISTS (
        SELECT 1 FROM task_items ti0
        WHERE ti0.task_id = t.id
        AND COALESCE(ti0.updated_at, ti0.created_at) >= ?
        AND COALESCE(ti0.updated_at, ti0.created_at) <= ?
      )
    )`;
    params.push(startDt, endDt, startDt, endDt);
  }

  let empClause = '';
  if (empFilter) {
    empClause = ' AND ti.assigned_to = ?';
    params.push(empFilter);
  }

  const sqlWithPoster = `
    SELECT
      t.id AS t_id,
      t.title AS t_title,
      t.created_at AS t_created_at,
      ti.id AS i_id,
      ti.assigned_to AS i_assigned_to,
      ti.phone AS i_phone,
      ti.poster_id AS i_poster_id,
      ti.remark AS i_remark,
      ti.status AS i_status,
      ti.updated_at AS i_updated_at,
      ti.created_at AS i_created_at,
      ea.real_name AS assignee_name,
      tp.title AS poster_title
    FROM tasks t
    INNER JOIN task_items ti ON ti.task_id = t.id
    LEFT JOIN employees ea ON ea.id = ti.assigned_to
    LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id
    WHERE t.tenant_id = ? ${dateClause} ${empClause}
    ORDER BY t.created_at DESC, ti.created_at ASC
    LIMIT 5000`;

  const sqlNoPoster = sqlWithPoster
    .replace(
      'tp.title AS poster_title',
      "CAST(NULL AS CHAR) AS poster_title"
    )
    .replace(
      'LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id\n    ',
      ''
    );

  let rows: Record<string, unknown>[];
  try {
    rows = await query<Record<string, unknown>>(sqlWithPoster, params);
  } catch (e) {
    const msg = String((e as Error)?.message || '');
    if (msg.includes('task_posters')) {
      rows = await query<Record<string, unknown>>(sqlNoPoster, params);
    } else {
      throw e;
    }
  }

  const byTask = new Map<string, TaskProgressOverviewRow>();
  for (const row of rows) {
    const tid = String(row.t_id ?? '');
    if (!tid) continue;
    const iid = String(row.i_id ?? '');
    const phone = row.i_phone != null ? String(row.i_phone) : null;
    const posterId = row.i_poster_id != null ? String(row.i_poster_id) : null;
    const posterTitle = row.poster_title != null && String(row.poster_title).trim() !== '' ? String(row.poster_title) : null;
    const displayLabel = posterId ? (posterTitle || 'Poster') : (phone || '-');

    const st = String(row.i_status ?? 'todo') === 'done' ? 'done' : 'todo';
    const doneAt =
      st === 'done'
        ? toIso(row.i_updated_at != null ? row.i_updated_at : row.i_created_at)
        : null;

    const item = {
      id: iid,
      task_item_id: iid,
      task_id: tid,
      task_title: String(row.t_title ?? ''),
      display_label: displayLabel,
      status: st as 'done' | 'todo',
      assigned_to: row.i_assigned_to != null ? String(row.i_assigned_to) : null,
      assignee_name: row.assignee_name != null ? String(row.assignee_name) : null,
      done_at: doneAt || null,
      remark: row.i_remark != null ? String(row.i_remark) : null,
    };

    if (!byTask.has(tid)) {
      byTask.set(tid, {
        task_id: tid,
        task_title: String(row.t_title ?? ''),
        created_at: toIso(row.t_created_at),
        total: 0,
        done: 0,
        items: [],
        employeeStats: [],
      });
    }
    const g = byTask.get(tid)!;
    g.items.push(item);
  }

  for (const g of byTask.values()) {
    g.total = g.items.length;
    g.done = g.items.filter((i) => i.status === 'done').length;
    const statMap = new Map<string, { name: string; done: number; total: number }>();
    for (const it of g.items) {
      const eid = it.assigned_to ?? '_unassigned';
      const name = it.assignee_name?.trim() || (eid === '_unassigned' ? 'Unassigned' : 'Unknown');
      if (!statMap.has(eid)) {
        statMap.set(eid, { name, done: 0, total: 0 });
      }
      const s = statMap.get(eid)!;
      s.total += 1;
      if (it.status === 'done') s.done += 1;
    }
    g.employeeStats = Array.from(statMap.entries()).map(([employee_id, v]) => ({
      employee_id,
      name: v.name,
      done: v.done,
      total: v.total,
    }));
  }

  return Array.from(byTask.values());
}

function toIso(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return toMySqlDatetime(v);
  if (typeof v === 'string') return v;
  return String(v);
}

export interface MyTaskItemGroup {
  task: {
    id: string;
    tenant_id: string;
    template_id: string | null;
    title: string;
    total_items: number;
    status: string;
    source_page: string | null;
    created_by: string | null;
    created_at: string;
  };
  items: Array<{
    id: string;
    task_id: string;
    assigned_to: string | null;
    phone: string | null;
    poster_id: string | null;
    remark: string | null;
    status: string;
    channel: string | null;
    updated_by: string | null;
    updated_at: string | null;
    created_at: string;
    poster_data_url?: string | null;
  }>;
  doneCount: number;
}

/**
 * 当前员工在指定租户下、进行中任务里分配到的子项（汇率页右侧「工作任务」等）
 * 同时包含该员工创建的任务（即使没有分配给自己的子项，也能在面板中看到）
 */
const MY_TASK_ITEMS_SQL = `SELECT
         t.id AS t_id,
         t.tenant_id AS t_tenant_id,
         t.template_id AS t_template_id,
         t.title AS t_title,
         t.total_items AS t_total_items,
         t.status AS t_status,
         t.source_page AS t_source_page,
         t.created_by AS t_created_by,
         t.created_at AS t_created_at,
         ti.id AS i_id,
         ti.task_id AS i_task_id,
         ti.assigned_to AS i_assigned_to,
         ti.phone AS i_phone,
         ti.poster_id AS i_poster_id,
         ti.remark AS i_remark,
         ti.status AS i_status,
         ti.channel AS i_channel,
         ti.updated_by AS i_updated_by,
         ti.updated_at AS i_updated_at,
         ti.created_at AS i_created_at,
         tp.data_url AS poster_data_url
       FROM task_items ti
       INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
       LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id
       WHERE (ti.assigned_to = ? OR t.created_by = ?) AND t.status = 'open'
       ORDER BY t.created_at DESC, ti.created_at ASC`;

const MY_TASK_ITEMS_SQL_NO_POSTER = MY_TASK_ITEMS_SQL.replace(
  'tp.data_url AS poster_data_url',
  'CAST(NULL AS CHAR) AS poster_data_url'
).replace(
  'LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id\n       ',
  ''
);

export async function getMyTaskItemsForEmployee(tenantId: string, employeeId: string): Promise<MyTaskItemGroup[]> {
  try {
    await ensureTasksTablesAndItems();
    let rows: Record<string, unknown>[];
    try {
      rows = await query<Record<string, unknown>>(MY_TASK_ITEMS_SQL, [tenantId, employeeId, employeeId]);
    } catch (e) {
      const msg = String((e as Error)?.message || '');
      if (msg.includes('task_posters')) {
        rows = await query<Record<string, unknown>>(MY_TASK_ITEMS_SQL_NO_POSTER, [tenantId, employeeId, employeeId]);
      } else {
        throw e;
      }
    }

    const byTask = new Map<string, MyTaskItemGroup>();
    for (const row of rows) {
      const tid = String(row.t_id ?? '');
      if (!tid) continue;
      if (!byTask.has(tid)) {
        byTask.set(tid, {
          task: {
            id: tid,
            tenant_id: String(row.t_tenant_id ?? ''),
            template_id: row.t_template_id != null ? String(row.t_template_id) : null,
            title: String(row.t_title ?? ''),
            total_items: Number(row.t_total_items ?? 0),
            status: String(row.t_status ?? 'open'),
            source_page: row.t_source_page != null ? String(row.t_source_page) : null,
            created_by: row.t_created_by != null ? String(row.t_created_by) : null,
            created_at: toIso(row.t_created_at),
          },
          items: [],
          doneCount: 0,
        });
      }
      const g = byTask.get(tid)!;
      const st = String(row.i_status ?? 'todo');
      g.items.push({
        id: String(row.i_id ?? ''),
        task_id: String(row.i_task_id ?? ''),
        assigned_to: row.i_assigned_to != null ? String(row.i_assigned_to) : null,
        phone: row.i_phone != null ? String(row.i_phone) : null,
        poster_id: row.i_poster_id != null ? String(row.i_poster_id) : null,
        remark: row.i_remark != null ? String(row.i_remark) : null,
        status: st,
        channel: row.i_channel != null ? String(row.i_channel) : null,
        updated_by: row.i_updated_by != null ? String(row.i_updated_by) : null,
        updated_at: row.i_updated_at != null ? toIso(row.i_updated_at) : null,
        created_at: toIso(row.i_created_at),
        poster_data_url: row.poster_data_url != null ? String(row.poster_data_url) : null,
      });
    }

    for (const g of byTask.values()) {
      g.doneCount = g.items.filter((i) => i.status === 'done').length;
    }

    return Array.from(byTask.values());
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (msg.includes('task_items') || msg.includes("doesn't exist") || msg.includes("Unknown table")) {
      return [];
    }
    throw e;
  }
}

export async function updateTaskItemRemarkForAssignee(
  itemId: string,
  tenantId: string,
  employeeId: string,
  remark: string
): Promise<boolean> {
  const result = await execute(
    `UPDATE task_items ti
     INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
     SET ti.remark = ?, ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
     WHERE ti.id = ? AND ti.assigned_to = ?`,
    [tenantId, remark, employeeId, itemId, employeeId]
  );
  return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
}

export async function markTaskItemDoneForAssignee(
  itemId: string,
  tenantId: string,
  employeeId: string,
  remark?: string | null
): Promise<boolean> {
  if (remark != null && remark !== '') {
    const result = await execute(
      `UPDATE task_items ti
       INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
       SET ti.status = 'done', ti.remark = ?, ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
       WHERE ti.id = ? AND ti.assigned_to = ? AND ti.status <> 'done'`,
      [tenantId, remark, employeeId, itemId, employeeId]
    );
    return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
  }
  const result = await execute(
    `UPDATE task_items ti
     INNER JOIN tasks t ON t.id = ti.task_id AND t.tenant_id = ?
     SET ti.status = 'done', ti.updated_by = ?, ti.updated_at = CURRENT_TIMESTAMP(3)
     WHERE ti.id = ? AND ti.assigned_to = ? AND ti.status <> 'done'`,
    [tenantId, employeeId, itemId, employeeId]
  );
  return ((result as { affectedRows?: number })?.affectedRows ?? 0) > 0;
}
