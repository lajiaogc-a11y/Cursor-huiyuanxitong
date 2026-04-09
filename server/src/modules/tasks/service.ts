/**
 * 客户维护任务服务 — 业务编排层
 * DB 访问统一委托给 repository 层。
 */
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import { randomUUID } from 'crypto';
import {
  ensureTasksTablesAndItemsRepository,
  queryTradedMembersInRange,
  queryAllActiveMembersWithLastTx,
  insertTaskRepository,
  insertTaskItemsBatchRepository,
  insertPosterTaskItemRepository,
  queryPosterIdsByTenant,
  queryOpenTasksRepository,
  closeTaskRepository,
  queryTaskProgressRows,
  queryMyTaskItemRows,
  updateTaskItemRemarkRepository,
  markTaskItemDoneRepository,
} from './repository.js';

export interface CustomerListResult {
  count: number;
  phones: string[];
  sample: { phone: string; last_tx: string | null }[];
}

export async function generateCustomerList(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<CustomerListResult> {
  const tradedRows = await queryTradedMembersInRange(
    tenantId,
    toMySqlDatetime(startDate),
    toMySqlDatetime(endDate),
  );

  const tradedMemberIds = new Set<string>();
  const tradedPhones = new Set<string>();
  for (const r of tradedRows) {
    if (r.member_id) tradedMemberIds.add(r.member_id);
    if (r.phone) tradedPhones.add(r.phone.replace(/\D/g, ''));
  }

  const allMembers = await queryAllActiveMembersWithLastTx(tenantId);

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
        last_tx: m.last_tx ? toMySqlDatetime(new Date(m.last_tx)).slice(0, 10) : null,
      });
    }
  }

  return { count: untradedPhones.length, phones: untradedPhones, sample: untradedSample };
}

export async function createMaintenanceTask(
  tenantId: string,
  createdBy: string,
  title: string,
  phones: string[],
  assignTo: string[],
  distribute: 'even' | 'manual',
): Promise<{ task_id: string; distributed: Record<string, number> }> {
  await ensureTasksTablesAndItemsRepository();

  const taskId = randomUUID();
  await insertTaskRepository({
    id: taskId,
    tenantId,
    title,
    totalItems: phones.length,
    sourcePage: 'maintenance_settings',
    createdBy,
  });

  const distributed: Record<string, number> = {};
  assignTo.forEach((id) => { distributed[id] = 0; });

  if (assignTo.length > 0 && phones.length > 0) {
    const BATCH = 200;
    for (let start = 0; start < phones.length; start += BATCH) {
      const slice = phones.slice(start, start + BATCH);
      const batch = slice.map((phone, i) => {
        const empId = assignTo[(start + i) % assignTo.length];
        distributed[empId] = (distributed[empId] || 0) + 1;
        return { id: randomUUID(), taskId, assignedTo: empId, phone };
      });
      await insertTaskItemsBatchRepository(batch);
    }
  }

  return { task_id: taskId, distributed };
}

export async function createPosterDistributionTask(
  tenantId: string,
  createdBy: string,
  title: string,
  posterIds: string[],
  assignTo: string[],
  distribute: 'even' | 'manual',
): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const uniquePosters = [...new Set(posterIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (uniquePosters.length === 0) {
    throw Object.assign(new Error('poster_ids required'), { code: 'VALIDATION_ERROR' });
  }
  if (!assignTo.length) {
    throw Object.assign(new Error('assign_to required'), { code: 'VALIDATION_ERROR' });
  }

  let found: { id: string }[];
  try {
    found = await queryPosterIdsByTenant(tenantId, uniquePosters);
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

  await ensureTasksTablesAndItemsRepository();

  const taskId = randomUUID();
  await insertTaskRepository({
    id: taskId,
    tenantId,
    title,
    totalItems: uniquePosters.length,
    sourcePage: 'tasks_posters',
    createdBy,
  });

  const distributed: Record<string, number> = {};
  assignTo.forEach((id) => { distributed[id] = 0; });

  if (assignTo.length > 0) {
    for (let i = 0; i < uniquePosters.length; i++) {
      const empId = assignTo[i % assignTo.length];
      await insertPosterTaskItemRepository({
        id: randomUUID(),
        taskId,
        assignedTo: empId,
        posterId: uniquePosters[i],
      });
      distributed[empId] = (distributed[empId] || 0) + 1;
    }
  }

  return { task_id: taskId, distributed };
}

export async function getOpenTasks(
  tenantId: string,
): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  try {
    return await queryOpenTasksRepository(tenantId);
  } catch (_) {
    return [];
  }
}

export async function closeTask(taskId: string, tenantId: string): Promise<boolean> {
  try {
    return (await closeTaskRepository(taskId, tenantId)) > 0;
  } catch (_) {
    return false;
  }
}

// ── Task progress ──

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
  options?: { employeeId?: string | null; startDate?: string; endDate?: string },
): Promise<TaskProgressOverviewRow[]> {
  await ensureTasksTablesAndItemsRepository();
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
    .replace('tp.title AS poster_title', "CAST(NULL AS CHAR) AS poster_title")
    .replace('LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id\n    ', '');

  let rows: Record<string, unknown>[];
  try {
    rows = await queryTaskProgressRows(sqlWithPoster, params);
  } catch (e) {
    const msg = String((e as Error)?.message || '');
    if (msg.includes('task_posters')) {
      rows = await queryTaskProgressRows(sqlNoPoster, params);
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
    const doneAt = st === 'done' ? toIso(row.i_updated_at != null ? row.i_updated_at : row.i_created_at) : null;

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
    byTask.get(tid)!.items.push(item);
  }

  for (const g of byTask.values()) {
    g.total = g.items.length;
    g.done = g.items.filter((i) => i.status === 'done').length;
    const statMap = new Map<string, { name: string; done: number; total: number }>();
    for (const it of g.items) {
      const eid = it.assigned_to ?? '_unassigned';
      const name = it.assignee_name?.trim() || (eid === '_unassigned' ? 'Unassigned' : 'Unknown');
      if (!statMap.has(eid)) statMap.set(eid, { name, done: 0, total: 0 });
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

// ── My task items ──

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
  'CAST(NULL AS CHAR) AS poster_data_url',
).replace(
  'LEFT JOIN task_posters tp ON tp.id = ti.poster_id AND tp.tenant_id = t.tenant_id\n       ',
  '',
);

export async function getMyTaskItemsForEmployee(tenantId: string, employeeId: string): Promise<MyTaskItemGroup[]> {
  try {
    await ensureTasksTablesAndItemsRepository();
    let rows: Record<string, unknown>[];
    try {
      rows = await queryMyTaskItemRows(MY_TASK_ITEMS_SQL, [tenantId, employeeId, employeeId]);
    } catch (e) {
      const msg = String((e as Error)?.message || '');
      if (msg.includes('task_posters')) {
        rows = await queryMyTaskItemRows(MY_TASK_ITEMS_SQL_NO_POSTER, [tenantId, employeeId, employeeId]);
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
    if (msg.includes('task_items') || msg.includes("doesn't exist") || msg.includes('Unknown table')) {
      return [];
    }
    throw e;
  }
}

export async function updateTaskItemRemarkForAssignee(
  itemId: string,
  tenantId: string,
  employeeId: string,
  remark: string,
): Promise<boolean> {
  return updateTaskItemRemarkRepository(tenantId, employeeId, itemId, remark);
}

export async function markTaskItemDoneForAssignee(
  itemId: string,
  tenantId: string,
  employeeId: string,
  remark?: string | null,
): Promise<boolean> {
  return markTaskItemDoneRepository(tenantId, employeeId, itemId, remark);
}
