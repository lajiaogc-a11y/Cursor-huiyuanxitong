/**
 * 表代理 GET 原始响应（含 count=exact 时的 total），供 apiGet 无法返回 count 的场景
 */
import { apiClient } from "@/lib/apiClient";

export async function fetchTableSelectRaw(
  table: string,
  queryParams: Record<string, string>,
): Promise<{ data: unknown; count: number | null }> {
  const path = `/api/data/table/${table}?${new URLSearchParams(queryParams).toString()}`;
  const json = await apiClient.get<{
    data?: unknown;
    count?: number | null;
    error?: { message?: string };
  }>(path);
  return { data: json.data, count: json.count ?? null };
}
