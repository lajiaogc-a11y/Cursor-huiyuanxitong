/**
 * 系统健康检查用到的 data 表探测（员工端仪表盘）
 */
import { pingEmployeesData, listWebVitalsData } from "@/api/systemHealthData";
import { fetchTableCounts } from "@/api/adminStatsApi";

const HEALTH_TABLE_NAMES = [
  "orders",
  "members",
  "employees",
  "activity_gifts",
  "operation_logs",
  "notifications",
] as const;

export type HealthDataTableName = (typeof HEALTH_TABLE_NAMES)[number];

export async function pingEmployeesSample(): Promise<void> {
  await pingEmployeesData();
}

export async function getDataTableHeadCount(tableName: HealthDataTableName): Promise<number> {
  const counts = await fetchTableCounts([tableName]);
  return counts[tableName] ?? 0;
}

export type WebVitalsRow = {
  metric_name: string;
  metric_value: number | string;
  rating?: string;
};

export async function listWebVitalsSince(isoTimestamp: string): Promise<WebVitalsRow[]> {
  try {
    const data = (await listWebVitalsData(
      `select=metric_name,metric_value,rating&created_at=gte.${encodeURIComponent(isoTimestamp)}`,
    )) as WebVitalsRow[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
