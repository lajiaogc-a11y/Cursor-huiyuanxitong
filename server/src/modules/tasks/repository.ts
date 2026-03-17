/**
 * 工作任务 Repository - 使用 queryPg 直连数据库绕过 RLS
 * supabaseAdmin 实际使用 anon key（非 service_role），仍受 RLS 限制
 */
import { queryPg } from '../../database/pg.js';

export interface TaskProgressItem {
  id: string;
  task_item_id: string;
  task_id: string;
  task_title: string;
  display_label: string;
  status: 'todo' | 'done';
  assigned_to: string | null;
  assignee_name: string | null;
  done_at: string | null;
  remark: string | null;
}

export interface TaskProgressOverview {
  task_id: string;
  task_title: string;
  created_at: string;
  total: number;
  done: number;
  items: TaskProgressItem[];
  employeeStats: { employee_id: string; name: string; done: number; total: number }[];
}

export async function getTaskProgressList(params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TaskProgressOverview[]> {
  const { tenantId, employeeId, startDate, endDate } = params;

  // 查询任务
  let taskSql = `SELECT id, title, created_at FROM tasks WHERE tenant_id = $1 AND status = 'open'`;
  const taskParams: unknown[] = [tenantId];
  let idx = 2;
  if (startDate) { taskSql += ` AND created_at >= $${idx}::timestamptz`; taskParams.push(`${startDate}T00:00:00Z`); idx++; }
  if (endDate) { taskSql += ` AND created_at <= $${idx}::timestamptz`; taskParams.push(`${endDate}T23:59:59Z`); idx++; }
  taskSql += ` ORDER BY created_at DESC`;

  const tasks = await queryPg<{ id: string; title: string; created_at: string }>(taskSql, taskParams);
  if (!tasks.length) return [];

  const taskIds = tasks.map(t => t.id);
  // 查询任务项
  let items = await queryPg<{
    id: string; task_id: string; phone: string | null; poster_id: string | null;
    remark: string | null; assigned_to: string | null; status: string; updated_at: string;
  }>(`SELECT id, task_id, phone, poster_id, remark, assigned_to, status, updated_at FROM task_items WHERE task_id = ANY($1::uuid[])`, [taskIds]);

  if (!items.length) return [];

  if (employeeId) {
    items = items.filter(i => i.assigned_to === employeeId);
    if (!items.length) return [];
  }

  // 查询完成日志
  const itemIds = items.map(i => i.id);
  const logs = await queryPg<{ task_item_id: string; created_at: string }>(
    `SELECT task_item_id, created_at FROM task_item_logs WHERE action = 'marked_done' AND task_item_id = ANY($1::uuid[]) ORDER BY created_at DESC`, [itemIds]
  );
  const doneAtMap = new Map<string, string>();
  logs.forEach(l => { if (!doneAtMap.has(l.task_item_id)) doneAtMap.set(l.task_item_id, l.created_at); });

  // 查询员工名
  const empIds = [...new Set(items.map(i => i.assigned_to).filter(Boolean))];
  const employees = empIds.length ? await queryPg<{ id: string; real_name: string }>(
    `SELECT id, real_name FROM employees WHERE id = ANY($1::uuid[])`, [empIds]
  ) : [];
  const empMap = new Map(employees.map(e => [e.id, e.real_name]));

  const tasksMap = new Map(tasks.map(t => [t.id, t]));
  const byTask = new Map<string, TaskProgressItem[]>();

  items.forEach(i => {
    const task = tasksMap.get(i.task_id);
    if (!task) return;
    const item: TaskProgressItem = {
      id: i.id, task_item_id: i.id, task_id: i.task_id,
      task_title: task.title || '',
      display_label: i.poster_id ? '海报' : (i.phone || '-'),
      status: (i.status as 'todo' | 'done') || 'todo',
      assigned_to: i.assigned_to,
      assignee_name: i.assigned_to ? empMap.get(i.assigned_to) || null : null,
      done_at: doneAtMap.get(i.id) || null,
      remark: i.remark,
    };
    if (!byTask.has(i.task_id)) byTask.set(i.task_id, []);
    byTask.get(i.task_id)!.push(item);
  });

  const result: TaskProgressOverview[] = [];
  byTask.forEach((itemsList, taskId) => {
    const task = tasksMap.get(taskId);
    if (!task) return;
    const total = itemsList.length;
    const done = itemsList.filter(i => i.status === 'done').length;
    const empStats = new Map<string, { done: number; total: number }>();
    itemsList.forEach(i => {
      const key = i.assigned_to || '_unassigned';
      if (!empStats.has(key)) empStats.set(key, { done: 0, total: 0 });
      const s = empStats.get(key)!;
      s.total++;
      if (i.status === 'done') s.done++;
    });
    result.push({
      task_id: taskId, task_title: task.title || '', created_at: task.created_at || '',
      total, done, items: itemsList,
      employeeStats: Array.from(empStats.entries()).map(([eid, s]) => ({
        employee_id: eid, name: eid === '_unassigned' ? '-' : (empMap.get(eid) || '-'), done: s.done, total: s.total,
      })),
    });
  });
  result.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  return result;
}

export interface TaskItemWithPoster {
  id: string; task_id: string; assigned_to: string | null; phone: string | null;
  poster_id: string | null; poster_data_url?: string | null; remark: string | null;
  status: 'todo' | 'done'; created_at: string;
}

export interface TaskWithItems {
  task: { id: string; title: string; created_at: string; status: string };
  items: TaskItemWithPoster[];
  doneCount: number;
}

export async function getMyTaskItems(employeeId: string): Promise<TaskWithItems[]> {
  const items = await queryPg<Record<string, unknown>>(
    `SELECT * FROM task_items WHERE assigned_to = $1 AND status IN ('todo','done') ORDER BY created_at DESC`, [employeeId]
  );
  if (!items.length) return [];

  const posterIds = [...new Set(items.map(i => i.poster_id as string).filter(Boolean))];
  let postersMap = new Map<string, string>();
  if (posterIds.length) {
    const posters = await queryPg<{ id: string; data_url: string }>(
      `SELECT id, data_url FROM task_posters WHERE id = ANY($1::uuid[])`, [posterIds]
    );
    postersMap = new Map(posters.map(p => [p.id, p.data_url]));
  }

  const taskIds = [...new Set(items.map(i => i.task_id as string))];
  const tasksData = await queryPg<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ANY($1::uuid[])`, [taskIds]);
  const tasksMap = new Map(tasksData.map(t => [t.id as string, t]));

  const byTask = new Map<string, { task: Record<string, unknown>; items: TaskItemWithPoster[] }>();
  items.forEach(row => {
    const t = tasksMap.get(row.task_id as string);
    if (!t || t.status !== 'open') return;
    const item: TaskItemWithPoster = {
      id: row.id as string, task_id: row.task_id as string,
      assigned_to: row.assigned_to as string | null, phone: row.phone as string | null,
      poster_id: row.poster_id as string | null,
      poster_data_url: row.poster_id ? postersMap.get(row.poster_id as string) || null : null,
      remark: row.remark as string | null, status: (row.status as 'todo' | 'done') || 'todo',
      created_at: row.created_at as string,
    };
    if (!byTask.has(row.task_id as string)) byTask.set(row.task_id as string, { task: t, items: [] });
    byTask.get(row.task_id as string)!.items.push(item);
  });

  return Array.from(byTask.values()).map(g => ({
    task: g.task as TaskWithItems['task'], items: g.items,
    doneCount: g.items.filter(i => i.status === 'done').length,
  }));
}

async function getOrCreateTemplate(tenantId: string, module: string, name: string, createdBy: string): Promise<string> {
  const existing = await queryPg<{ id: string }>(
    `SELECT id FROM task_templates WHERE tenant_id = $1 AND module = $2 LIMIT 1`, [tenantId, module]
  );
  if (existing.length) return existing[0].id;
  const created = await queryPg<{ id: string }>(
    `INSERT INTO task_templates (tenant_id, name, module, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenantId, name, module, createdBy]
  );
  return created[0].id;
}

/** 创建发动态任务并分配 */
export async function createPosterTask(params: {
  title: string; posterIds: string[]; assignTo: string[];
  distribute: 'even' | 'manual'; manualMap?: Record<string, string[]>;
  createdBy: string; tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const { title, posterIds, assignTo, distribute, manualMap, createdBy, tenantId } = params;
  const templateId = await getOrCreateTemplate(tenantId, 'post_dynamic', '发动态', createdBy);

  const taskRows = await queryPg<{ id: string }>(
    `INSERT INTO tasks (tenant_id, template_id, title, total_items, status, source_page, created_by) VALUES ($1, $2, $3, $4, 'open', 'rates_page', $5) RETURNING id`,
    [tenantId, templateId, title, posterIds.length, createdBy]
  );
  const taskId = taskRows[0].id;

  const distributed: Record<string, number> = {};
  let assignments: { employeeId: string; posterIds: string[] }[] = [];
  if (distribute === 'manual' && manualMap) {
    assignments = Object.entries(manualMap).map(([eid, p]) => ({ employeeId: eid, posterIds: p }));
  } else {
    const per = Math.floor(posterIds.length / assignTo.length);
    const remainder = posterIds.length % assignTo.length;
    let idx = 0;
    assignTo.forEach((eid, i) => {
      const count = per + (i < remainder ? 1 : 0);
      assignments.push({ employeeId: eid, posterIds: posterIds.slice(idx, idx + count) });
      idx += count;
    });
  }

  for (const a of assignments) {
    for (const posterId of a.posterIds) {
      await queryPg(`INSERT INTO task_items (task_id, assigned_to, poster_id) VALUES ($1, $2, $3)`, [taskId, a.employeeId, posterId]);
      distributed[a.employeeId] = (distributed[a.employeeId] || 0) + 1;
    }
  }
  return { task_id: taskId, distributed };
}

/** 创建客户维护任务并分配 */
export async function createCustomerMaintenanceTask(params: {
  title: string; phones: string[]; assignTo: string[];
  distribute: 'even' | 'manual'; manualMap?: Record<string, string[]>;
  createdBy: string; tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const { title, phones, assignTo, distribute, manualMap, createdBy, tenantId } = params;
  const templateId = await getOrCreateTemplate(tenantId, 'customer_maintenance', '客户维护', createdBy);

  const taskRows = await queryPg<{ id: string }>(
    `INSERT INTO tasks (tenant_id, template_id, title, total_items, status, source_page, created_by) VALUES ($1, $2, $3, $4, 'open', 'rates_page', $5) RETURNING id`,
    [tenantId, templateId, title, phones.length, createdBy]
  );
  const taskId = taskRows[0].id;

  const distributed: Record<string, number> = {};
  assignTo.forEach(id => { distributed[id] = 0; });

  let assignments: { employeeId: string; phones: string[] }[] = [];
  if (distribute === 'manual' && manualMap) {
    assignments = Object.entries(manualMap).map(([eid, p]) => ({ employeeId: eid, phones: p }));
  } else {
    const per = Math.floor(phones.length / assignTo.length);
    const remainder = phones.length % assignTo.length;
    let idx = 0;
    assignTo.forEach((eid, i) => {
      const count = per + (i < remainder ? 1 : 0);
      assignments.push({ employeeId: eid, phones: phones.slice(idx, idx + count) });
      distributed[eid] = count;
      idx += count;
    });
  }

  for (const a of assignments) {
    for (const phone of a.phones) {
      await queryPg(`INSERT INTO task_items (task_id, assigned_to, phone) VALUES ($1, $2, $3)`, [taskId, a.employeeId, phone]);
      distributed[a.employeeId] = (distributed[a.employeeId] || 0) + 1;
    }
  }
  return { task_id: taskId, distributed };
}
