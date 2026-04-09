/**
 * 通用表导入 — upsert / insert
 */
import { apiPost } from './client';


export function upsertImportBatch(table: string, batch: unknown[], onConflict?: string) {
  return apiPost(`/api/data/table/${encodeURIComponent(table)}`, { data: batch, upsert: true, onConflict });
}

export function insertImportBatch(table: string, batch: unknown[]) {
  return apiPost(`/api/data/table/${encodeURIComponent(table)}`, { data: batch });
}

export function upsertImportRecord(table: string, record: unknown, onConflict?: string) {
  return apiPost(`/api/data/table/${encodeURIComponent(table)}`, { data: record, upsert: true, onConflict });
}

export function insertImportRecord(table: string, record: unknown) {
  return apiPost(`/api/data/table/${encodeURIComponent(table)}`, { data: record });
}
