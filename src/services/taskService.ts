/**
 * Task Service — customer maintenance & poster distribution.
 */
import { fail, getErrorMessage, ok, ServiceResult } from "@/services/serviceResult";
import { tasksApi } from "@/api/tasks";
import { taskPostersApi } from "@/api/taskPosters";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { dispatchWorkTasksRefresh } from "@/lib/workTasksRefresh";

const SHANGHAI = "Asia/Shanghai";
function beijingDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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

/** 上周一~周日日期范围 (北京时间) */
export function getLastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() + diff - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return {
    start: beijingDateStr(lastMonday),
    end: beijingDateStr(lastSunday),
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
      start: beijingDateStr(start),
      end: beijingDateStr(end),
    };
  }
  if (preset === "last_3_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: beijingDateStr(start),
      end: beijingDateStr(end),
    };
  }
  return getLastWeekRange();
}

export async function generateCustomerList(params?: {
  start_date?: string;
  end_date?: string;
  tenantId?: string;
}): Promise<{
  count: number;
  phones: string[];
  sample: { phone: string; last_tx: string | null }[];
}> {
  const empty = { count: 0, phones: [], sample: [] as { phone: string; last_tx: string | null }[] };
  if (!params?.tenantId || !params.start_date || !params.end_date) {
    return empty;
  }
  const raw = await tasksApi.generateCustomerList({
    tenant_id: params.tenantId,
    start_date: params.start_date,
    end_date: params.end_date,
  });
  const res = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!res) return empty;
  const phones = Array.isArray(res.phones) ? res.phones
    : Array.isArray((res as any).data?.phones) ? (res as any).data.phones
    : [];
  const sample = Array.isArray(res.sample) ? res.sample
    : Array.isArray((res as any).data?.sample) ? (res as any).data.sample
    : [];
  return {
    count: typeof res.count === 'number' ? res.count : phones.length,
    phones,
    sample,
  };
}

export async function createCustomerMaintenanceTask(params: {
  title: string;
  phones: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const raw = await tasksApi.create({
    tenant_id: params.tenantId,
    title: params.title,
    phones: params.phones,
    assign_to: params.assignTo,
    distribute: params.distribute,
  });
  const res = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const taskId = res.task_id ?? (res as any).data?.task_id;
  const distributed = res.distributed ?? (res as any).data?.distributed ?? {};
  if (taskId) {
    return { task_id: String(taskId), distributed: distributed as Record<string, number> };
  }
  throw new Error("CREATE_TASK_FAILED");
}

export interface TaskItemWithPoster extends TaskItem {
  poster_data_url?: string | null;
}

export async function getMyTaskItems(
  tenantId: string | null | undefined,
): Promise<{ task: Task; items: TaskItemWithPoster[]; doneCount: number }[]> {
  if (!tenantId) return [];
  const raw = await tasksApi.getMyItems({ tenant_id: tenantId, _: String(Date.now()) });
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) return (raw as any).data;
  return [];
}

export async function updateTaskItemRemark(
  itemId: string,
  remark: string,
  _operatorId: string,
  tenantId: string | null | undefined,
): Promise<void> {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  await tasksApi.updateItemRemark(itemId, { tenant_id: tenantId, remark });
}

export async function markTaskItemDone(
  itemId: string,
  _operatorId: string,
  remark?: string,
  tenantId?: string | null,
): Promise<void> {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  await tasksApi.markItemDone(itemId, { tenant_id: tenantId, remark: remark ?? null });
}

export async function logTaskItemCopy(
  itemId: string,
  _operatorId: string,
  tenantId?: string | null,
): Promise<void> {
  if (!tenantId) return;
  try {
    await tasksApi.logCopy(itemId, { tenant_id: tenantId });
  } catch {
    /* 非关键 */
  }
}

/** 维护历史记录 */
export interface MaintenanceHistoryRecord {
  id: string;
  task_item_id: string;
  task_id: string;
  task_title: string;
  phone: string | null;
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
  employeeStats: { employee_id: string; name: string; done: number; total: number }[];
}

export async function getMaintenanceHistory(_params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  status?: TaskItemStatus;
}): Promise<MaintenanceHistoryRecord[]> {
  return [];
}

export async function getOpenTasks(tenantId: string): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  const raw = await tasksApi.getOpen({ tenant_id: tenantId });
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) return (raw as any).data;
  return [];
}

export async function closeTask(taskId: string, tenantId: string): Promise<void> {
  await tasksApi.close(taskId, { tenant_id: tenantId });
}

export async function getTaskProgressList(params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TaskProgressOverview[]> {
  const q = new URLSearchParams();
  q.set("tenant_id", params.tenantId);
  if (params.employeeId && params.employeeId !== "all") {
    q.set("employee_id", params.employeeId);
  }
  if (params.startDate) q.set("start_date", params.startDate);
  if (params.endDate) q.set("end_date", params.endDate);
  const paramsObj: Record<string, string> = {};
  q.forEach((v, k) => { paramsObj[k] = v; });
  const data = await tasksApi.getProgressList(paramsObj);
  return Array.isArray(data) ? data as TaskProgressOverview[] : [];
}

export async function savePosterToLibrary(params: {
  tenantId: string;
  employeeId: string;
  dataUrl: string;
  title?: string;
}): Promise<{ id: string }> {
  const raw = await taskPostersApi.save({
    tenant_id: params.tenantId,
    data_url: params.dataUrl,
    title: params.title || null,
  });
  const res = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const posterId = res.id ?? (res as any).data?.id;
  if (posterId) {
    notifyDataMutation({ table: "task_posters", operation: "INSERT", source: "mutation" }).catch(console.error);
    return { id: String(posterId) };
  }
  throw new Error("SAVE_POSTER_FAILED");
}

export async function getTaskPosters(tenantId: string): Promise<TaskPoster[]> {
  const raw = await taskPostersApi.list({ tenant_id: tenantId });
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).data)) return (raw as any).data;
  return [];
}

export async function updateTaskPoster(
  posterId: string,
  tenantId: string,
  updates: { title?: string }
): Promise<void> {
  await taskPostersApi.update(posterId, { tenant_id: tenantId, title: updates.title });
}

export async function deleteTaskPoster(posterId: string, tenantId: string): Promise<void> {
  await taskPostersApi.delete(posterId, { tenant_id: tenantId });
}

export async function createPosterTask(params: {
  title: string;
  posterIds: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const raw = await tasksApi.createPoster({
    tenant_id: params.tenantId,
    title: params.title,
    poster_ids: params.posterIds,
    assign_to: params.assignTo,
    distribute: params.distribute,
  });
  const res = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const taskId = res.task_id ?? (res as any).data?.task_id;
  const distributed = res.distributed ?? (res as any).data?.distributed ?? {};
  if (taskId) {
    return { task_id: String(taskId), distributed: distributed as Record<string, number> };
  }
  throw new Error("CREATE_POSTER_TASK_FAILED");
}

function mapTaskError(error: unknown) {
  const message = getErrorMessage(error);
  if (message.includes("task_not_found")) {
    return fail("TASK_NOT_FOUND", "Task not found", "TASK", error);
  }
  if (message.includes("task_already_closed")) {
    return fail("TASK_ALREADY_CLOSED", "Task already closed", "TASK", error);
  }
  if (message.includes("poster_not_found")) {
    return fail("POSTER_NOT_FOUND", "Poster not found", "TASK", error);
  }
  return fail("UNKNOWN", message || "Task service failed", "TASK", error, true);
}

export async function getOpenTasksResult(
  tenantId: string
): Promise<ServiceResult<{ id: string; title: string; created_at: string; total_items: number }[]>> {
  try {
    const data = await getOpenTasks(tenantId);
    return ok(data);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function getTaskProgressListResult(params: {
  tenantId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ServiceResult<TaskProgressOverview[]>> {
  try {
    const data = await getTaskProgressList(params);
    return ok(data);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function getTaskPostersResult(tenantId: string): Promise<ServiceResult<TaskPoster[]>> {
  try {
    const data = await getTaskPosters(tenantId);
    return ok(data);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function closeTaskResult(taskId: string, tenantId: string): Promise<ServiceResult<void>> {
  try {
    await closeTask(taskId, tenantId);
    notifyDataMutation({ table: "tasks", operation: "UPDATE", source: "mutation" }).catch(console.error);
    dispatchWorkTasksRefresh();
    return ok(undefined);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function createCustomerMaintenanceTaskResult(params: {
  title: string;
  phones: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<ServiceResult<{ task_id: string; distributed: Record<string, number> }>> {
  try {
    const data = await createCustomerMaintenanceTask(params);
    notifyDataMutation({ table: "tasks", operation: "INSERT", source: "mutation" }).catch(console.error);
    dispatchWorkTasksRefresh();
    return ok(data);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function createPosterTaskResult(params: {
  title: string;
  posterIds: string[];
  assignTo: string[];
  distribute: "even" | "manual";
  manualMap?: Record<string, string[]>;
  createdBy: string;
  tenantId: string;
}): Promise<ServiceResult<{ task_id: string; distributed: Record<string, number> }>> {
  try {
    const data = await createPosterTask(params);
    notifyDataMutation({ table: "tasks", operation: "INSERT", source: "mutation" }).catch(console.error);
    dispatchWorkTasksRefresh();
    return ok(data);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function updateTaskPosterResult(
  posterId: string,
  tenantId: string,
  updates: { title?: string }
): Promise<ServiceResult<void>> {
  try {
    await updateTaskPoster(posterId, tenantId, updates);
    return ok(undefined);
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function deleteTaskPosterResult(
  posterId: string,
  tenantId: string
): Promise<ServiceResult<void>> {
  try {
    await deleteTaskPoster(posterId, tenantId);
    return ok(undefined);
  } catch (error) {
    return mapTaskError(error);
  }
}
