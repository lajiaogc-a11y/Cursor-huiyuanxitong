/**
 * data_backups 表代理 + 通用表 upsert（恢复数据用）
 */
import { apiGet, apiPost } from './client';


export function listBackupRecords(query: string) {
  return apiGet<unknown[]>(`/api/data/table/data_backups${query ? `?${query}` : ''}`);
}

export function getBackupRecordById(backupId: string) {
  return apiGet<unknown | null>(`/api/data/table/data_backups?select=*&id=eq.${encodeURIComponent(backupId)}&single=true`);
}

export function upsertTableRows(table: string, body: { data: unknown[]; upsert: boolean; onConflict: string }) {
  return apiPost(`/api/data/table/${encodeURIComponent(table)}`, body);
}
