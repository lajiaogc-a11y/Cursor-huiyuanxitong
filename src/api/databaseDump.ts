/**
 * Database Dump API Client — 流式 Blob 下载
 *
 * apiClient 仅支持 JSON，此模块使用原生 fetch 处理二进制流响应。
 */
import { API_ACCESS_TOKEN_KEY } from '@/lib/apiClient';

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
}

export type MysqlDumpMode = 'full' | 'schema' | 'data';

export function getMysqlDumpUrl(mode: MysqlDumpMode): string {
  return `${apiBase()}/api/admin/database/mysql-dump?mode=${encodeURIComponent(mode)}`;
}

export async function fetchMysqlDumpBlob(
  mode: MysqlDumpMode,
): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem(API_ACCESS_TOKEN_KEY) : null;
  if (!token) {
    return { ok: false, error: '未登录' };
  }
  const url = getMysqlDumpUrl(mode);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error?.message || j?.message || msg;
    } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
  const cd = res.headers.get('Content-Disposition');
  let filename = `dump_${mode}.sql`;
  const m = cd?.match(/filename="?([^";]+)"?/i);
  if (m) filename = m[1];
  const blob = await res.blob();
  return { ok: true, blob, filename };
}

export function getMysqlDumpCurlExample(mode: MysqlDumpMode): string {
  const url = getMysqlDumpUrl(mode);
  return `curl -L -o "backup_${mode}.sql" -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" "${url}"`;
}
