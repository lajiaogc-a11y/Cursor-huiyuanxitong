/**
 * error_reports 表代理
 */
import { apiGet, apiPost, apiDelete } from './client';


export function submitErrorReportData(payload: Record<string, unknown>) {
  return apiPost('/api/data/table/error_reports', { data: payload });
}

export function listErrorReportsData(query: string) {
  return apiGet<unknown>(`/api/data/table/error_reports${query ? `?${query}` : ''}`);
}

export function deleteErrorReportData(id: string) {
  return apiDelete(`/api/data/table/error_reports?id=eq.${encodeURIComponent(id)}`);
}

export function deleteErrorReportsByIdsData(inList: string) {
  return apiDelete(`/api/data/table/error_reports?id=in.(${inList})`);
}
