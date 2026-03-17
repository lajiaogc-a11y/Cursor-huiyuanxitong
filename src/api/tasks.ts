/**
 * 工作任务 API - 通过后端 JWT 认证，绕过 Supabase RLS
 */
import { apiClient } from '@/lib/apiClient';
import type { TaskProgressOverview } from '@/services/taskService';
import type { TaskItemWithPoster } from '@/services/taskService';

export interface TaskWithItems {
  task: { id: string; title: string; created_at: string; status: string };
  items: TaskItemWithPoster[];
  doneCount: number;
}

export async function getTaskProgressApi(params: {
  tenant_id: string;
  employee_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<TaskProgressOverview[]> {
  const q = new URLSearchParams();
  q.set('tenant_id', params.tenant_id);
  if (params.employee_id && params.employee_id !== 'all') q.set('employee_id', params.employee_id);
  if (params.start_date) q.set('start_date', params.start_date);
  if (params.end_date) q.set('end_date', params.end_date);
  const res = await apiClient.get<TaskProgressOverview[] | { success?: boolean; data?: TaskProgressOverview[] }>(
    `/api/tasks/progress?${q.toString()}`
  );
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: TaskProgressOverview[] }).data ?? [];
  return [];
}

export async function getMyTaskItemsApi(): Promise<TaskWithItems[]> {
  const res = await apiClient.get<TaskWithItems[] | { success?: boolean; data?: TaskWithItems[] }>(
    '/api/tasks/my-items'
  );
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: TaskWithItems[] }).data ?? [];
  return [];
}

export async function createPosterTaskApi(params: {
  title: string;
  posterIds: string[];
  assignTo: string[];
  distribute?: 'even' | 'manual';
  manualMap?: Record<string, string[]>;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const res = await apiClient.post<{ task_id: string; distributed: Record<string, number> } | { success?: boolean; data?: { task_id: string; distributed: Record<string, number> } }>(
    '/api/tasks/poster',
    {
      title: params.title,
      poster_ids: params.posterIds,
      assign_to: params.assignTo,
      distribute: params.distribute || 'even',
      manual_map: params.manualMap,
      tenant_id: params.tenantId,
    }
  );
  if (res && typeof res === 'object' && 'task_id' in res) return res as { task_id: string; distributed: Record<string, number> };
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: { task_id: string; distributed: Record<string, number> } }).data!;
  throw new Error('Invalid response');
}

export async function createCustomerMaintenanceTaskApi(params: {
  title: string;
  phones: string[];
  assignTo: string[];
  distribute?: 'even' | 'manual';
  manualMap?: Record<string, string[]>;
  tenantId: string;
}): Promise<{ task_id: string; distributed: Record<string, number> }> {
  const res = await apiClient.post<{ task_id: string; distributed: Record<string, number> } | { success?: boolean; data?: { task_id: string; distributed: Record<string, number> } }>(
    '/api/tasks/maintenance',
    {
      title: params.title,
      phones: params.phones,
      assign_to: params.assignTo,
      distribute: params.distribute || 'even',
      manual_map: params.manualMap,
      tenant_id: params.tenantId,
    }
  );
  if (res && typeof res === 'object' && 'task_id' in res) return res as { task_id: string; distributed: Record<string, number> };
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: { task_id: string; distributed: Record<string, number> } }).data!;
  throw new Error('Invalid response');
}
