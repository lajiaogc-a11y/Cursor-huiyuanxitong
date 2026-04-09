/**
 * Employees 表代理 — 员工数据查/写
 */
import { apiGet, apiPost, apiPatch } from './client';


export function hasAnyEmployeeRows() {
  return apiGet<unknown[]>(`/api/data/table/employees?select=id&limit=1`);
}

export function getEmployeeRowById(id: string) {
  return apiGet<unknown>(`/api/data/table/employees?select=*&id=eq.${encodeURIComponent(id)}&single=true`);
}

export function createEmployeeRowData(body: Record<string, unknown>) {
  return apiPost('/api/data/table/employees', { data: body });
}

export function patchEmployeeRowData(id: string, body: Record<string, unknown>) {
  return apiPatch(`/api/data/table/employees?id=eq.${encodeURIComponent(id)}`, { data: body });
}
