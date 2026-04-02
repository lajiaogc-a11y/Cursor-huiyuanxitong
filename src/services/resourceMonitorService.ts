// ============= 资源用量与成本监控服务 =============
// 表行数：表代理 count；API 日志：api_request_logs（无表或无权时降级为空）

import { fetchTableSelectRaw } from "@/api/tableProxyRaw";

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
  const results: TableUsageStats[] = [];

  const promises = MONITORED_TABLES.map(async (tableName) => {
    try {
      const { count } = await fetchTableSelectRaw(tableName, {
        select: "*",
        count: "exact",
        limit: "0",
      });
      const c = Number(count) || 0;
      return {
        table_name: tableName,
        row_count: c,
        estimated_size_bytes: c * 500,
      };
    } catch {
      return { table_name: tableName, row_count: 0, estimated_size_bytes: 0 };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }

  return results.sort((a, b) => b.row_count - a.row_count);
}

async function getEdgeFunctionStats(): Promise<EdgeFunctionStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, count } = await fetchTableSelectRaw("api_request_logs", {
      select: "path,response_time_ms,status_code",
      created_at: `gte.${since}`,
      limit: "10000",
      count: "exact",
    });
    const records = Array.isArray(data) ? data : [];
    const totalCalls = Number(count) || records.length;

    const totalMs = records.reduce(
      (sum: number, r: { response_time_ms?: number }) => sum + (Number(r.response_time_ms) || 0),
      0,
    );
    const avgMs = records.length > 0 ? Math.round(totalMs / records.length) : 0;

    const errorCount = records.filter(
      (r: { status_code?: number }) => Number(r.status_code) >= 400,
    ).length;
    const errorRate =
      records.length > 0 ? Math.round((errorCount / records.length) * 100) : 0;

    const callsByEndpoint: Record<string, number> = {};
    for (const r of records as { path?: string }[]) {
      const ep = r.path || "unknown";
      callsByEndpoint[ep] = (callsByEndpoint[ep] || 0) + 1;
    }

    return {
      total_calls: totalCalls,
      avg_response_ms: avgMs,
      error_rate: errorRate,
      calls_by_endpoint: callsByEndpoint,
    };
  } catch {
    return {
      total_calls: 0,
      avg_response_ms: 0,
      error_rate: 0,
      calls_by_endpoint: {},
    };
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
