// ============= 资源用量与成本监控服务 =============
// 表行数：表代理 count；API 日志：api_request_logs（无表或无权时降级为空）

import { fetchTableCounts, fetchApiLogStats } from "@/api/adminStatsApi";

export interface TableUsageStats {
  table_name: string;
  row_count: number;
  estimated_size_bytes: number;
}

export interface EdgeFunctionStats {
  total_calls: number;
  avg_response_ms: number;
  error_rate: number;
  calls_by_endpoint: Record<string, number>;
}

export interface ResourceUsageSummary {
  tables: TableUsageStats[];
  totalRows: number;
  totalEstimatedSizeMB: number;
  edgeFunctionStats: EdgeFunctionStats;
  storageBucketCount: number;
}

const MONITORED_TABLES = [
  "orders",
  "members",
  "operation_logs",
  "points_ledger",
  "activity_gifts",
  "ledger_transactions",
  "balance_change_logs",
  "employee_login_logs",
  "notifications",
  "audit_records",
  "error_reports",
  "api_request_logs",
  "archived_orders",
  "archived_operation_logs",
  "archived_points_ledger",
];

async function getTableRowCounts(): Promise<TableUsageStats[]> {
  try {
    const counts = await fetchTableCounts([...MONITORED_TABLES]);
    return MONITORED_TABLES
      .map((t) => ({
        table_name: t,
        row_count: counts[t] ?? 0,
        estimated_size_bytes: (counts[t] ?? 0) * 500,
      }))
      .sort((a, b) => b.row_count - a.row_count);
  } catch {
    return MONITORED_TABLES.map((t) => ({
      table_name: t, row_count: 0, estimated_size_bytes: 0,
    }));
  }
}

async function getEdgeFunctionStats(): Promise<EdgeFunctionStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    return await fetchApiLogStats(since);
  } catch {
    return { total_calls: 0, avg_response_ms: 0, error_rate: 0, calls_by_endpoint: {} };
  }
}

export async function getResourceUsage(): Promise<ResourceUsageSummary> {
  const [tables, edgeFunctionStats] = await Promise.all([
    getTableRowCounts(),
    getEdgeFunctionStats(),
  ]);

  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0);
  const totalEstimatedSizeMB =
    Math.round((tables.reduce((sum, t) => sum + t.estimated_size_bytes, 0) / 1024 / 1024) * 100) / 100;

  return {
    tables,
    totalRows,
    totalEstimatedSizeMB,
    edgeFunctionStats,
    storageBucketCount: 0,
  };
}

export const COST_THRESHOLDS = {
  MAX_TOTAL_ROWS: 500000,
  MAX_TABLE_ROWS: 100000,
  MAX_API_CALLS_24H: 10000,
};

export function evaluateCostAlerts(summary: ResourceUsageSummary): string[] {
  const alerts: string[] = [];
  if (summary.totalRows > COST_THRESHOLDS.MAX_TOTAL_ROWS) {
    alerts.push(`总行数 ${summary.totalRows} 超过建议阈值 ${COST_THRESHOLDS.MAX_TOTAL_ROWS}`);
  }
  for (const t of summary.tables) {
    if (t.row_count > COST_THRESHOLDS.MAX_TABLE_ROWS) {
      alerts.push(`表 ${t.table_name} 行数 ${t.row_count} 超过单表建议阈值`);
    }
  }
  if (summary.edgeFunctionStats.total_calls > COST_THRESHOLDS.MAX_API_CALLS_24H) {
    alerts.push(
      `近 24h API 调用 ${summary.edgeFunctionStats.total_calls} 超过建议阈值 ${COST_THRESHOLDS.MAX_API_CALLS_24H}`,
    );
  }
  return alerts;
}

/** ResourceMonitorTab 使用此名称 */
export const checkThresholdAlerts = evaluateCostAlerts;
