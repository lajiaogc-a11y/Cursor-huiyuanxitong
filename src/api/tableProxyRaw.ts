/**
 * 表代理 GET 原始响应（含 count=exact 时的 total），供 apiGet 无法返回 count 的场景
 */
import { resolveBearerTokenForPath } from "@/lib/apiClient";

export async function fetchTableSelectRaw(
  table: string,
  queryParams: Record<string, string>,
): Promise<{ data: unknown; count: number | null }> {
  const path = `/api/data/table/${table}?${new URLSearchParams(queryParams).toString()}`;
  const API_BASE = import.meta.env.VITE_API_BASE ?? "";
  const url = `${API_BASE}${path}`.replace(/([^:])\/\/+/g, "$1/");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = resolveBearerTokenForPath(path);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    count?: number | null;
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg =
      json?.error && typeof json.error === "object" && "message" in json.error
        ? String((json.error as { message: string }).message)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return { data: json.data, count: json.count ?? null };
}
