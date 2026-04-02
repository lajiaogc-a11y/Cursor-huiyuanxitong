/**
 * MySQL 完整转储（mysqldump）— 由 Node API 流式输出，用于整站迁移。
 * 大库建议用 getMysqlDumpCurlExample 在终端执行，避免浏览器内存占满。
 */
import { API_ACCESS_TOKEN_KEY } from '@/lib/apiClient';

function apiBase(): string {
  const b = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  return b;
}

export type MysqlDumpMode = 'full' | 'schema' | 'data';

export function getMysqlDumpUrl(mode: MysqlDumpMode): string {
  return `${apiBase()}/api/admin/database/mysql-dump?mode=${encodeURIComponent(mode)}`;
}

/** 浏览器内下载（适合中小型库；超大请用 curl） */
export async function downloadMysqlDump(
  mode: MysqlDumpMode,
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; filename?: string; error?: string }> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem(API_ACCESS_TOKEN_KEY) : null;
  if (!token) {
    return { ok: false, error: '未登录' };
  }
  const url = getMysqlDumpUrl(mode);
  onProgress?.('请求备份…');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error?.message || j?.message || msg;
    } catch {
      /* ignore */
    }
    return { ok: false, error: msg };
  }
  const cd = res.headers.get('Content-Disposition');
  let filename = `dump_${mode}.sql`;
  const m = cd?.match(/filename="?([^";]+)"?/i);
  if (m) filename = m[1];
  onProgress?.('下载中…');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return { ok: true, filename };
}

export function getMysqlDumpCurlExample(mode: MysqlDumpMode): string {
  const url = getMysqlDumpUrl(mode);
  return `curl -L -o "backup_${mode}.sql" -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" "${url}"`;
}
