/**
 * 工作任务服务 - 客户维护、发动态
 */
import { supabase } from "@/integrations/supabase/client";

export type TaskTemplateModule = "customer_maintenance" | "post_dynamic";
export type TaskItemStatus = "todo" | "done";
export type TaskStatus = "open" | "closed";

export interface TaskTemplate {
  id: string;
  tenant_id: string;
  name: string;
  module: TaskTemplateModule;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  tenant_id: string;
  template_id: string | null;
  title: string;
  total_items: number;
  status: TaskStatus;
  source_page: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaskItem {
  id: string;
  task_id: string;
  assigned_to: string | null;
  phone: string | null;
  poster_id: string | null;
  remark: string | null;
  status: TaskItemStatus;
  channel: string | null;
  updated_by: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface TaskPoster {
  id: string;
  tenant_id: string;
  title: string | null;
  data_url: string | null;
  source_page: string | null;
  created_by: string | null;
  created_at: string;
  /** 已分配给哪些员工（姓名列表） */
  assigned_employee_names?: string[];
}

export interface TaskItemLog {
  id: string;
  task_item_id: string;
  action: string;
  operator: string | null;
  note: string | null;
  created_at: string;
}

/** 上周一~周日日期范围 */
export function getLastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() + diff - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
  };
}

/** 预设日期范围：上周未交易、上月未交易、近三个月未交易 */
export type DateRangePreset = "last_week" | "last_month" | "last_3_months";
export function getDateRangeForPreset(preset: DateRangePreset): { start: string; end: string } {
  if (preset === "last_week") return getLastWeekRange();
  const now = new Date();
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  if (preset === "last_3_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  return getLastWeekRange();
}

/**
 * 未交易客户判定方法：
 * 1. 获取指定日期范围内所有订单（status: completed/pending）
 * 2. 提取有交易的会员：orders.member_id 或 orders.phone_number 匹配
 * 3. 未交易 = 会员表中存在，但在该日期范围内无任何订单的会员
 * 4. 过滤：手机号长度>=10 的会员
 * 5. 排除新入会会员：仅统计在搜索日期范围结束前已入会的会员（created_at <= end），
 *    本月新入会的会员在查询上月订单时必然无交易，不应计入未交易名单
 * 6. 租户隔离：传入 tenantId 时仅统计该租户的会员与订单（creator_id/recorder_id/sales_user_id 关联该租户员工）
 */
export async function generateCustomerList(params?: {
  start_date?: string;
  end_date?: string;
  tenantId?: string;
}): Promise<{
  count: number;
  phones: string[];
  sample: { phone: string; last_tx: string | null }[];
}> {
  const { start, end } = params?.start_date && params?.end_date
    ? { start: params.start_date, end: params.end_date }
    : getLastWeekRange();

  // 租户隔离：获取该租户员工 ID 列表，用于过滤 members 和 orders
  let empIds: string[] = [];
  if (params?.tenantId) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id")
      .eq("tenant_id", params.tenantId);
    empIds = (emps || []).map((e: { id: string }) => e.id);
    if (empIds.length === 0) return { count: 0, phones: [], sample: [] };
  }

  let membersQuery = supabase
    .from("members")
    .select("id, phone_number, created_at");
  // 排除在搜索日期范围结束之后才入会的会员（如查上月未交易，排除本月新入会的）
  membersQuery = membersQuery.lte("created_at", `${end}T23:59:59.999Z`);
  if (empIds.length > 0) {
    membersQuery = membersQuery.or(`creator_id.in.(${empIds.join(",")}),recorder_id.in.(${empIds.join(",")})`);
  }
  const { data: members, error: membersError } = await membersQuery;

  if (membersError) throw membersError;
  if (!members?.length) return { count: 0, phones: [], sample: [] };

  let ordersQuery = supabase
    .from("orders")
    .select("member_id, phone_number")
    .gte("created_at", `${start}T00:00:00Z`)
    .lte("created_at", `${end}T23:59:59Z`)
    .in("status", ["completed", "pending"]);
  if (empIds.length > 0) {
    ordersQuery = ordersQuery.or(`creator_id.in.(${empIds.join(",")}),sales_user_id.in.(${empIds.join(",")})`);
  }
  const { data: ordersInRange } = await ordersQuery;

  const tradedMemberIds = new Set<string>();
  const tradedPhones = new Set<string>();
  ordersInRange?.forEach((o: any) => {
    if (o.member_id) tradedMemberIds.add(o.member_id);
    if (o.phone_number) tradedPhones.add((o.phone_number || "").replace(/\D/g, ""));
  });

  const untraded = members.filter((m: any) => {
    const phone = (m.phone_number || "").replace(/\D/g, "");
    if (tradedPhones.has(phone)) return false;
    if (tradedMemberIds.has(m.id)) return false;
    return phone.length >= 10;
  });

  const phones = untraded.map((m: any) => m.phone_number || "").filter(Boolean);

  return {
    count: phones.length,
    phones,
    sample: phones.slice(0, 20).map((phone) => ({ phone, last_tx: null })),
  };
}

/** 创建任务并分配（客户维护） */
export async function createCustomerMaintenanceTask(params: {
  title: string;
  phones: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const { title, phones, assignTo, distribute, manualMap, createdBy, tenantId } = params;
  const templateModule = "customer_maintenance";

  let { data: template } = await supabase
    .from("task_templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("module", templateModule)
    .maybeSingle();

  if (!template) {
    const { data: newTpl } = await supabase
      .from("task_templates")
      .insert({
        tenant_id: tenantId,
        name: "客户维护",
        module: templateModule,
        created_by: createdBy,
      })
      .select("id")
      .single();
    template = newTpl;
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      tenant_id: tenantId,
      template_id: template?.id,
      title,
      total_items: phones.length,
      status: "open",
      source_page: "rates_page",
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (taskErr || !task) throw taskErr || new Error("Failed to create task");

  const distributed: Record<string, number> = {};
  assignTo.forEach((id) => { distributed[id] = 0; });

  let assignments: { employeeId: string; phones: string[] }[] = [];
  if (distribute === "manual" && manualMap) {
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

  const items: { task_id: string; assigned_to: string; phone: string }[] = [];
  assignments.forEach((a) => {
    a.phones.forEach((phone) => {
      items.push({ task_id: task.id, assigned_to: a.employeeId, phone });
      distributed[a.employeeId] = (distributed[a.employeeId] || 0) + 1;
    });
  });

  const { error: itemsErr } = await supabase.from("task_items").insert(items);
  if (itemsErr) throw itemsErr;

  return { task_id: task.id, distributed };
}

export interface TaskItemWithPoster extends TaskItem {
  poster_data_url?: string | null;
}

/** 获取当前员工的未完成任务项（含海报任务的 data_url） */
export async function getMyTaskItems(employeeId: string): Promise<
  { task: Task; items: TaskItemWithPoster[]; doneCount: number }[]
> {
  const { data: items, error } = await supabase
    .from("task_items")
    .select("*")
    .eq("assigned_to", employeeId)
    .in("status", ["todo", "done"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!items?.length) return [];

  const posterIds = [...new Set(items.map((i: any) => i.poster_id).filter(Boolean))];
  let postersMap = new Map<string, string>();
  if (posterIds.length > 0) {
    const { data: posters } = await supabase
      .from("task_posters")
      .select("id, data_url")
      .in("id", posterIds);
    postersMap = new Map((posters || []).map((p: any) => [p.id, p.data_url]));
  }

  const taskIds = [...new Set(items.map((i: any) => i.task_id))];
  const { data: tasksData } = await supabase.from("tasks").select("*").in("id", taskIds);
  const tasksMap = new Map((tasksData || []).map((t: any) => [t.id, t]));

  const byTask = new Map<string, { task: Task; items: TaskItemWithPoster[] }>();
  items.forEach((row: any) => {
    const t = tasksMap.get(row.task_id);
    if (!t || t.status !== "open") return;
    const item: TaskItemWithPoster = { ...row };
    if (row.poster_id) item.poster_data_url = postersMap.get(row.poster_id) || null;
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, { task: t as Task, items: [] });
    byTask.get(row.task_id)!.items.push(item);
  });

  return Array.from(byTask.values()).map((g) => ({
    task: g.task,
    items: g.items,
    doneCount: g.items.filter((i) => i.status === "done").length,
  }));
}

/** 标记任务项备注 */
export async function updateTaskItemRemark(
  itemId: string,
  remark: string,
  operatorId: string
): Promise<void> {
  const { error } = await supabase
    .from("task_items")
    .update({ remark, updated_by: operatorId, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
}

/** 标记任务项已完成 */
export async function markTaskItemDone(
  itemId: string,
  operatorId: string,
  remark?: string
): Promise<void> {
  const { error: upErr } = await supabase
    .from("task_items")
    .update({
      status: "done",
      remark: remark ?? undefined,
      updated_by: operatorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (upErr) throw upErr;

  await supabase.from("task_item_logs").insert({
    task_item_id: itemId,
    action: "marked_done",
    operator: operatorId,
    note: remark ?? null,
  });
}

/** 记录复制操作 */
export async function logTaskItemCopy(itemId: string, operatorId: string): Promise<void> {
  await supabase.from("task_item_logs").insert({
    task_item_id: itemId,
    action: "copied",
    operator: operatorId,
  });
}

/** 维护历史记录 */
export interface MaintenanceHistoryRecord {
  id: string;
  task_item_id: string;
  task_id: string;
  task_title: string;
  phone: string | null;
  /** 海报任务时显示「海报」，否则显示号码 */
  display_label: string;
  remark: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  done_by: string | null;
  done_by_name: string | null;
  done_at: string;
  status: TaskItemStatus;
}

/** 任务进度项（含已完成/未完成） */
export interface TaskProgressItem {
  id: string;
  task_item_id: string;
  task_id: string;
  task_title: string;
  display_label: string;
  status: TaskItemStatus;
  assigned_to: string | null;
  assignee_name: string | null;
  done_at: string | null;
  remark: string | null;
}

/** 任务进度概览（含统计） */
export interface TaskProgressOverview {
  task_id: string;
  task_title: string;
  created_at: string;
  total: number;
  done: number;
  items: TaskProgressItem[];
  /** 各员工完成情况 */
  employeeStats: { employee_id: string; name: string; done: number; total: number }[];
}

/** 查询维护历史（支持按员工、日期、状态筛选） */
export async function getMaintenanceHistory(params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  status?: TaskItemStatus;
}): Promise<MaintenanceHistoryRecord[]> {
  const { tenantId, employeeId, startDate, endDate, status } = params;

  let query = supabase
    .from("task_item_logs")
    .select(`
      id,
      task_item_id,
      action,
      operator,
      note,
      created_at
    `)
    .eq("action", "marked_done")
    .order("created_at", { ascending: false });

  if (startDate) {
    query = query.gte("created_at", `${startDate}T00:00:00Z`);
  }
  if (endDate) {
    query = query.lte("created_at", `${endDate}T23:59:59Z`);
  }

  const { data: logs, error } = await query;
  if (error) throw error;
  if (!logs?.length) return [];

  const itemIds = [...new Set(logs.map((l: any) => l.task_item_id))];
  const { data: items, error: itemsErr } = await supabase
    .from("task_items")
    .select("id, task_id, phone, poster_id, remark, assigned_to, status, updated_at")
    .in("id", itemIds);

  if (itemsErr || !items?.length) return [];

  const itemsMap = new Map((items || []).map((i: any) => [i.id, i]));

  const taskIds = [...new Set(items.map((i: any) => i.task_id))];
  const { data: tasks } = await supabase.from("tasks").select("id, title, tenant_id").in("id", taskIds);
  const tasksMap = new Map((tasks || []).map((t: any) => [t.id, t]));

  const empIds = new Set<string>();
  items.forEach((i: any) => {
    if (i.assigned_to) empIds.add(i.assigned_to);
  });
  logs.forEach((l: any) => {
    if (l.operator) empIds.add(l.operator);
  });
  const { data: employees } = await supabase
    .from("employees")
    .select("id, real_name")
    .in("id", [...empIds]);
  const empMap = new Map((employees || []).map((e: any) => [e.id, e.real_name]));

  const records: MaintenanceHistoryRecord[] = [];
  for (const log of logs) {
    const item = itemsMap.get(log.task_item_id);
    if (!item) continue;
    const task = tasksMap.get(item.task_id);
    if (!task || task.tenant_id !== tenantId) continue;

    if (employeeId) {
      if (item.assigned_to !== employeeId && log.operator !== employeeId) continue;
    }
    if (status && item.status !== status) continue;

    records.push({
      id: log.id,
      task_item_id: log.task_item_id,
      task_id: item.task_id,
      task_title: (task as any).title || "",
      phone: item.phone,
      display_label: item.poster_id ? "海报" : (item.phone || "-"),
      remark: log.note ?? item.remark,
      assigned_to: item.assigned_to,
      assignee_name: item.assigned_to ? (empMap.get(item.assigned_to) || null) : null,
      done_by: log.operator,
      done_by_name: log.operator ? (empMap.get(log.operator) || null) : null,
      done_at: log.created_at,
      status: (item.status as TaskItemStatus) || "done",
    });
  }

  return records;
}

/** 获取租户下所有进行中的任务（维护设置中展示、可取消） */
export async function getOpenTasks(tenantId: string): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, created_at, total_items")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** 取消/关闭任务（删除记录 = 任务发布取消，会从汇率计算工作任务中消失） */
export async function closeTask(taskId: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ status: "closed" })
    .eq("id", taskId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

/** 获取任务进度列表（含已完成/未完成、各员工完成统计） */
export async function getTaskProgressList(params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TaskProgressOverview[]> {
  const { tenantId, employeeId, startDate, endDate } = params;

  let taskQuery = supabase
    .from("tasks")
    .select("id, title, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (startDate) {
    taskQuery = taskQuery.gte("created_at", `${startDate}T00:00:00Z`);
  }
  if (endDate) {
    taskQuery = taskQuery.lte("created_at", `${endDate}T23:59:59Z`);
  }

  const { data: tasks, error: tasksErr } = await taskQuery;
  if (tasksErr || !tasks?.length) return [];

  const taskIds = tasks.map((t: any) => t.id);
  let { data: items, error: itemsErr } = await supabase
    .from("task_items")
    .select("id, task_id, phone, poster_id, remark, assigned_to, status, updated_at")
    .in("task_id", taskIds);

  if (itemsErr || !items?.length) return [];

  if (employeeId) {
    items = items!.filter((i: any) => i.assigned_to === employeeId);
    if (!items.length) return [];
  }

  const itemIds = items!.map((i: any) => i.id);
  const { data: logs } = await supabase
    .from("task_item_logs")
    .select("task_item_id, created_at")
    .eq("action", "marked_done")
    .in("task_item_id", itemIds)
    .order("created_at", { ascending: false });

  const doneAtMap = new Map<string, string>();
  logs?.forEach((l: any) => {
    if (!doneAtMap.has(l.task_item_id)) doneAtMap.set(l.task_item_id, l.created_at);
  });

  const empIds = new Set<string>();
  items.forEach((i: any) => {
    if (i.assigned_to) empIds.add(i.assigned_to);
  });
  const { data: employees } = await supabase
    .from("employees")
    .select("id, real_name")
    .in("id", [...empIds]);
  const empMap = new Map((employees || []).map((e: any) => [e.id, e.real_name]));

  const tasksMap = new Map((tasks || []).map((t: any) => [t.id, t]));
  const byTask = new Map<string, TaskProgressItem[]>();

  items.forEach((i: any) => {
    const task = tasksMap.get(i.task_id);
    if (!task) return;
    const item: TaskProgressItem = {
      id: i.id,
      task_item_id: i.id,
      task_id: i.task_id,
      task_title: (task as any).title || "",
      display_label: i.poster_id ? "海报" : (i.phone || "-"),
      status: (i.status as TaskItemStatus) || "todo",
      assigned_to: i.assigned_to,
      assignee_name: i.assigned_to ? (empMap.get(i.assigned_to) || null) : null,
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
    const done = itemsList.filter((i) => i.status === "done").length;

    const empStats = new Map<string, { done: number; total: number }>();
    itemsList.forEach((i) => {
      const key = i.assigned_to || "_unassigned";
      if (!empStats.has(key)) empStats.set(key, { done: 0, total: 0 });
      const s = empStats.get(key)!;
      s.total++;
      if (i.status === "done") s.done++;
    });

    const employeeStats = Array.from(empStats.entries()).map(([eid, s]) => ({
      employee_id: eid,
      name: eid === "_unassigned" ? "-" : (empMap.get(eid) || "-"),
      done: s.done,
      total: s.total,
    }));

    result.push({
      task_id: taskId,
      task_title: (task as any).title || "",
      created_at: (task as any).created_at || "",
      total,
      done,
      items: itemsList,
      employeeStats,
    });
  });

  result.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  return result;
}

/** dataURL 转 Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/** 保存海报到任务海报库（上传到 Storage，避免大 base64 存入数据库） */
export async function savePosterToLibrary(params: {
  tenantId: string;
  employeeId: string;
  dataUrl: string;
  title?: string;
}): Promise<{ id: string }> {
  const blob = dataUrlToBlob(params.dataUrl);
  const fileName = `${params.tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("task-posters")
    .upload(fileName, blob, { contentType: "image/png", upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("task-posters").getPublicUrl(uploadData.path);
  const publicUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from("task_posters")
    .insert({
      tenant_id: params.tenantId,
      title: params.title || `汇率海报 ${new Date().toLocaleDateString()}`,
      data_url: publicUrl,
      source_page: "rates_page",
      created_by: params.employeeId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

/** 获取所有海报（任务海报库），含已分配员工 */
export async function getTaskPosters(tenantId: string): Promise<TaskPoster[]> {
  const { data, error } = await supabase
    .from("task_posters")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const posters = data || [];
  if (posters.length === 0) return posters;

  const posterIds = posters.map((p: any) => p.id);
  const { data: items } = await supabase
    .from("task_items")
    .select("poster_id, assigned_to")
    .in("poster_id", posterIds)
    .not("poster_id", "is", null);
  const byPoster = new Map<string, Set<string>>();
  (items || []).forEach((r: any) => {
    if (!r.assigned_to) return;
    if (!byPoster.has(r.poster_id)) byPoster.set(r.poster_id, new Set());
    byPoster.get(r.poster_id)!.add(r.assigned_to);
  });
  const empIds = new Set<string>();
  byPoster.forEach((s) => s.forEach((id) => empIds.add(id)));
  const { data: employees } = await supabase
    .from("employees")
    .select("id, real_name")
    .in("id", [...empIds]);
  const empMap = new Map((employees || []).map((e: any) => [e.id, e.real_name]));

  return posters.map((p: any) => {
    const ids = byPoster.get(p.id);
    const names = ids ? [...ids].map((id) => empMap.get(id) || id).filter(Boolean) : [];
    return { ...p, assigned_employee_names: [...new Set(names)] };
  });
}

/** 更新海报（标题等） */
export async function updateTaskPoster(
  posterId: string,
  tenantId: string,
  updates: { title?: string }
): Promise<void> {
  const { error } = await supabase
    .from("task_posters")
    .update(updates)
    .eq("id", posterId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

/** 删除海报 */
export async function deleteTaskPoster(posterId: string, tenantId: string): Promise<void> {
  const { error: delErr } = await supabase
    .from("task_posters")
    .delete()
    .eq("id", posterId)
    .eq("tenant_id", tenantId);
  if (delErr) throw delErr;
}

/** 创建发动态任务并分配 */
export async function createPosterTask(params: {
  title: string;
  posterIds: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const { title, posterIds, assignTo, distribute, manualMap, createdBy, tenantId } = params;
  const templateModule = "post_dynamic";

  let { data: template } = await supabase
    .from("task_templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("module", templateModule)
    .maybeSingle();

  if (!template) {
    const { data: newTpl, error: tplErr } = await supabase
      .from("task_templates")
      .insert({
        tenant_id: tenantId,
        name: "发动态",
        module: templateModule,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (tplErr) throw tplErr;
    template = newTpl;
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      tenant_id: tenantId,
      template_id: template?.id,
      title,
      total_items: posterIds.length,
      status: "open",
      source_page: "rates_page",
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (taskErr || !task) throw taskErr || new Error("创建任务失败");

  const distributed: Record<string, number> = {};
  let assignments: { employeeId: string; posterIds: string[] }[] = [];
  if (distribute === "manual" && manualMap) {
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

  const items: { task_id: string; assigned_to: string; poster_id: string }[] = [];
  assignments.forEach((a) => {
    a.posterIds.forEach((posterId) => {
      items.push({ task_id: task.id, assigned_to: a.employeeId, poster_id: posterId });
      distributed[a.employeeId] = (distributed[a.employeeId] || 0) + 1;
    });
  });

  const { error: itemsErr } = await supabase.from("task_items").insert(items);
  if (itemsErr) throw itemsErr;

  return { task_id: task.id, distributed };
}
