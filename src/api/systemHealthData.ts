/**
 * 系统健康数据 — employees ping + web_vitals 表代理
 */
import { apiGet } from './client';


export function pingEmployeesData() {
  return apiGet(`/api/data/table/employees?select=id&limit=1`);
}

export function listWebVitalsData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/web_vitals${query ? `?${query}` : ''}`);
}
