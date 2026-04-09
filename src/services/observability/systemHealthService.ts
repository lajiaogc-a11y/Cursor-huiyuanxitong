/**
 * 系统健康检查用到的 data 表探测（员工端仪表盘）
 */
import { dataTableApi } from "@/api/data";
import { fetchTableSelectRaw } from "@/api/tableProxyRaw";

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
  await dataTableApi.get("employees", "select=id&limit=1");
}

export async function getDataTableHeadCount(tableName: HealthDataTableName): Promise<number> {
  const { count } = await fetchTableSelectRaw(tableName, {
    select: "id",
    count: "exact",
    limit: "1",
  });
  return Number(count) || 0;
}

export type WebVitalsRow = {
  metric_name: string;
  metric_value: number | string;
  rating?: string;
};

export async function listWebVitalsSince(isoTimestamp: string): Promise<WebVitalsRow[]> {
  try {
    const data = await dataTableApi.get<WebVitalsRow[]>(
      "web_vitals",
      `select=metric_name,metric_value,rating&created_at=gte.${encodeURIComponent(isoTimestamp)}`,
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
