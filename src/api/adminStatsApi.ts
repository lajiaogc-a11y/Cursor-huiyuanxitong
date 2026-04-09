/**
 * Admin Stats API — 管理仪表盘统计（替代 legacy table proxy COUNT 调用）
 */
import { apiClient } from '@/lib/apiClient';

interface TableCountsResponse {
  success: boolean;
  counts: Record<string, number>;
}

interface FilteredCountResponse {
  success: boolean;
  count: number;
}

interface ApiLogStatsResponse {
  success: boolean;
  stats: {
    total_calls: number;
    avg_response_ms: number;
    error_rate: number;
    calls_by_endpoint: Record<string, number>;
  };
}

export async function fetchTableCounts(tables: string[]): Promise<Record<string, number>> {
  const res = await apiClient.getAsStaff<TableCountsResponse>(
    `/api/admin/stats/table-counts?tables=${encodeURIComponent(tables.join(','))}`,
  );
  return res?.counts ?? {};
}

export async function fetchFilteredCount(
  table: string,
  filters: { column: string; op: string; value: string }[],
): Promise<number> {
  const qs = new URLSearchParams({
    table,
    filters: JSON.stringify(filters),
  });
  const res = await apiClient.getAsStaff<FilteredCountResponse>(
    `/api/admin/stats/filtered-count?${qs.toString()}`,
  );
  return res?.count ?? 0;
}

export async function fetchApiLogStats(sinceIso?: string): Promise<ApiLogStatsResponse['stats']> {
  const qs = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : '';
  const res = await apiClient.getAsStaff<ApiLogStatsResponse>(
    `/api/admin/stats/api-log-stats${qs}`,
  );
  return res?.stats ?? { total_calls: 0, avg_response_ms: 0, error_rate: 0, calls_by_endpoint: {} };
}
