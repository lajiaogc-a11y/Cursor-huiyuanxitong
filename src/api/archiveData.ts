/**
 * 数据归档 — archive_runs 表代理 + archive RPC
 */

import { apiPost, apiGet, apiPatch } from './client';

export function getLatestArchiveRun() {
  return apiGet<{ id: string } | null>(`/api/data/table/archive_runs?select=id&order=run_at.desc&limit=1&single=true`);
}

export function patchArchiveRunDuration(id: string, duration_ms: number) {
  return apiPatch(`/api/data/table/archive_runs?id=eq.${encodeURIComponent(id)}`, { data: { duration_ms } });
}

export function listArchiveRuns(limit: number) {
  return apiGet<unknown[]>(`/api/data/table/archive_runs?select=*&order=run_at.desc&limit=${limit}`);
}

export function rpcArchiveOldData(retentionDays: number) {
  return apiPost<Record<string, unknown>>('/api/data/rpc/archive_old_data', { retention_days: retentionDays });
}
