// ============= 数据归档服务 =============
// 管理冷热数据分离 - 将历史数据归档到归档表

import { fetchTableCounts } from "@/api/adminStatsApi";
import { getLatestArchiveRun, patchArchiveRunDuration, listArchiveRuns, rpcArchiveOldData } from "@/api/archiveData";

export interface ArchiveRun {
  id: string;
  run_at: string;
  tables_processed: string[];
  records_archived: Record<string, number>;
  records_deleted: Record<string, number>;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  triggered_by: string;
}

export interface ArchiveStats {
  archived_orders: number;
  archived_operation_logs: number;
  archived_points_ledger: number;
}

async function countArchivedRows(tables: string[]): Promise<Record<string, number>> {
  try {
    return await fetchTableCounts(tables);
  } catch {
    return Object.fromEntries(tables.map((t) => [t, 0]));
  }
}

/**
 * 执行数据归档（MySQL：/api/data/rpc/archive_old_data）
 */
export async function runArchive(retentionDays: number = 90): Promise<{
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const data = await rpcArchiveOldData(retentionDays);

    const duration = Date.now() - startTime;

    try {
      const latest = await getLatestArchiveRun();
      if (latest?.id) {
        await patchArchiveRunDuration(latest.id, duration);
      }
    } catch (patchErr) {
      console.warn("[ArchiveService] Failed to patch archive_runs duration:", patchErr);
    }

    return { success: true, result: data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * 获取归档执行历史
 */
export async function getArchiveHistory(limit: number = 20): Promise<ArchiveRun[]> {
  try {
    const rows = (await listArchiveRuns(limit)) as ArchiveRun[];
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error("[ArchiveService] Failed to fetch history:", e);
    return [];
  }
}

/**
 * 获取各归档表的行数统计
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  const counts = await countArchivedRows([
    'archived_orders', 'archived_operation_logs', 'archived_points_ledger',
  ]);
  return {
    archived_orders: counts.archived_orders ?? 0,
    archived_operation_logs: counts.archived_operation_logs ?? 0,
    archived_points_ledger: counts.archived_points_ledger ?? 0,
  };
}
