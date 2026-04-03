import { resolveBearerTokenForPath } from '@/lib/apiClient';

/** 表代理 GET 带 count=exact 时，apiClient 只返回 data 会丢失 count，此处单独拉取总行数 */
export async function fetchTableCountExact(tableName: string): Promise<number> {
  try {
    const path = `/api/data/table/${encodeURIComponent(tableName)}?select=id&count=exact&limit=1`;
    const base = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const url = `${base}${path}`.replace(/([^:])\/\/+/g, '$1/');
    const token = resolveBearerTokenForPath(path);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as { count?: number };
    if (!res.ok) return 0;
    return typeof json.count === 'number' ? json.count : 0;
  } catch {
    return 0;
  }
}
