/**
 * MySQL 完整转储（mysqldump）— 由 Node API 流式输出，用于整站迁移。
 * 大库建议用 getMysqlDumpCurlExample 在终端执行，避免浏览器内存占满。
 */
import { fetchMysqlDumpBlob, getMysqlDumpCurlExample, type MysqlDumpMode } from '@/api/databaseDump';

export type { MysqlDumpMode };
export { getMysqlDumpCurlExample };

/** 浏览器内下载（适合中小型库；超大请用 curl） */
export async function downloadMysqlDump(
  mode: MysqlDumpMode,
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; filename?: string; error?: string }> {
  onProgress?.('请求备份…');
  const result = await fetchMysqlDumpBlob(mode);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  onProgress?.('下载中…');
  const { triggerBlobDownload } = await import('@/lib/downloadBlob');
  triggerBlobDownload(result.blob, result.filename);
  return { ok: true, filename: result.filename };
}
