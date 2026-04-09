// ============= 数据归档服务 =============
// 管理冷热数据分离 - 将历史数据归档到归档表

import { fetchTableSelectRaw } from "@/api/tableProxyRaw";
import { dataOpsApi, dataTableApi } from "@/api/data";

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

async function countArchivedRows(table: string): Promise<number> {
  try {
    const { count } = await fetchTableSelectRaw(table, {
      select: "*",
      count: "exact",
      limit: "0",
    });
    return Number(count) || 0;
  } catch {
    return 0;
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
    const data = await dataOpsApi.rpcArchiveOldData(retentionDays);

    const duration = Date.now() - startTime;

    try {
      const latest = await dataTableApi.get<{ id: string } | null>(
        "archive_runs",
        "select=id&order=run_at.desc&limit=1&single=true",
      );
      if (latest?.id) {
        await dataTableApi.patch("archive_runs", `id=eq.${encodeURIComponent(latest.id)}`, {
          data: { duration_ms: duration },
        });
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
    const rows = await dataTableApi.get<ArchiveRun[]>(
      "archive_runs",
      `select=*&order=run_at.desc&limit=${limit}`,
    );
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
  const [archived_orders, archived_operation_logs, archived_points_ledger] = await Promise.all([
    countArchivedRows("archived_orders"),
    countArchivedRows("archived_operation_logs"),
    countArchivedRows("archived_points_ledger"),
  ]);

  return {
    archived_orders,
    archived_operation_logs,
    archived_points_ledger,
  };
}
