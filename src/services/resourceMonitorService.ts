// ============= 资源用量与成本监控服务 =============

import { supabase } from '@/integrations/supabase/client';

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

// 需要监控的核心表
const MONITORED_TABLES = [
  'orders', 'members', 'operation_logs', 'points_ledger', 'activity_gifts',
  'ledger_transactions', 'balance_change_logs', 'employee_login_logs',
  'notifications', 'audit_records', 'error_reports', 'api_request_logs',
  'archived_orders', 'archived_operation_logs', 'archived_points_ledger',
];

/**
 * 获取各表的行数
 */
async function getTableRowCounts(): Promise<TableUsageStats[]> {
  const results: TableUsageStats[] = [];

  // Parallel count queries
  const promises = MONITORED_TABLES.map(async (tableName) => {
    try {
      const { count } = await supabase
        .from(tableName as any)
        .select('*', { count: 'exact', head: true });
      
      return {
        table_name: tableName,
        row_count: count ?? 0,
        estimated_size_bytes: (count ?? 0) * 500, // rough estimate: 500 bytes/row
      };
    } catch {
      return { table_name: tableName, row_count: 0, estimated_size_bytes: 0 };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }

  return results.sort((a, b) => b.row_count - a.row_count);
}

/**
 * 获取 Edge Function 调用统计（基于 api_request_logs）
 */
async function getEdgeFunctionStats(): Promise<EdgeFunctionStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, count } = await supabase
    .from('api_request_logs')
    .select('endpoint, response_time_ms, response_status', { count: 'exact' })
    .gte('created_at', since);

  const records = data || [];
  const totalCalls = count ?? records.length;
  
  const totalMs = records.reduce((sum, r) => sum + (r.response_time_ms || 0), 0);
  const avgMs = records.length > 0 ? Math.round(totalMs / records.length) : 0;
  
  const errorCount = records.filter(r => r.response_status >= 400).length;
  const errorRate = records.length > 0 ? Math.round((errorCount / records.length) * 100) : 0;

  const callsByEndpoint: Record<string, number> = {};
  for (const r of records) {
    callsByEndpoint[r.endpoint] = (callsByEndpoint[r.endpoint] || 0) + 1;
  }

  return { total_calls: totalCalls, avg_response_ms: avgMs, error_rate: errorRate, calls_by_endpoint: callsByEndpoint };
}

/**
 * 获取完整的资源用量摘要
 */
export async function getResourceUsage(): Promise<ResourceUsageSummary> {
  const [tables, edgeFunctionStats] = await Promise.all([
    getTableRowCounts(),
    getEdgeFunctionStats(),
  ]);

  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0);
  const totalEstimatedSizeMB = Math.round(tables.reduce((sum, t) => sum + t.estimated_size_bytes, 0) / 1024 / 1024 * 100) / 100;

  return {
    tables,
    totalRows,
    totalEstimatedSizeMB,
    edgeFunctionStats,
    storageBucketCount: 0,
  };
}

// ============= 成本预警阈值 =============
export const COST_THRESHOLDS = {
  MAX_TOTAL_ROWS: 500000,     // 50万行预警
  MAX_TABLE_ROWS: 100000,     // 单表10万行预警
  MAX_API_CALLS_24H: 10000,   // 24小时1万次API调用预警
  MAX_ERROR_RATE: 10,         // 错误率10%预警
} as const;

export function checkThresholdAlerts(summary: ResourceUsageSummary): string[] {
  const alerts: string[] = [];

  if (summary.totalRows > COST_THRESHOLDS.MAX_TOTAL_ROWS) {
    alerts.push(`总行数 ${summary.totalRows.toLocaleString()} 超过 ${COST_THRESHOLDS.MAX_TOTAL_ROWS.toLocaleString()} 预警线`);
  }

  for (const table of summary.tables) {
    if (table.row_count > COST_THRESHOLDS.MAX_TABLE_ROWS) {
      alerts.push(`表 ${table.table_name} 有 ${table.row_count.toLocaleString()} 行，超过 ${COST_THRESHOLDS.MAX_TABLE_ROWS.toLocaleString()} 预警线`);
    }
  }

  if (summary.edgeFunctionStats.total_calls > COST_THRESHOLDS.MAX_API_CALLS_24H) {
    alerts.push(`24h API调用 ${summary.edgeFunctionStats.total_calls.toLocaleString()} 次，超过预警线`);
  }

  if (summary.edgeFunctionStats.error_rate > COST_THRESHOLDS.MAX_ERROR_RATE) {
    alerts.push(`API错误率 ${summary.edgeFunctionStats.error_rate}%，超过 ${COST_THRESHOLDS.MAX_ERROR_RATE}% 预警线`);
  }

  return alerts;
}
