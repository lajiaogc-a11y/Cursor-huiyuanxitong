/**
 * API 调用统计（RPC：按日 / 按端点）
 */
import { observabilityApi } from "@/api/observability";

export interface ApiDailyStats {
  statDate: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  avgResponseTime: number;
}

export interface ApiEndpointStats {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
}

export async function fetchApiUsageStats(days: number): Promise<{
  dailyStats: ApiDailyStats[];
  endpointStats: ApiEndpointStats[];
}> {
  const [dailyData, endpointData] = await Promise.all([
    observabilityApi.getDailyStats(days),
    observabilityApi.getEndpointStats(days),
  ]);
  const dailyRows = Array.isArray(dailyData) ? dailyData : [];
  const endpointRows = Array.isArray(endpointData) ? endpointData : [];
  const dailyStats = dailyRows.map((d: Record<string, unknown>) => ({
    statDate: d.stat_date as string,
    totalRequests: Number(d.total_requests),
    successfulRequests: Number(d.successful_requests),
    failedRequests: Number(d.failed_requests),
    errorRate: Number(d.error_rate) || 0,
    avgResponseTime: Number(d.avg_response_time) || 0,
  }));
  const endpointStats = endpointRows.map((e: Record<string, unknown>) => ({
    endpoint: e.endpoint as string,
    totalRequests: Number(e.total_requests),
    successfulRequests: Number(e.successful_requests),
    failedRequests: Number(e.failed_requests),
    avgResponseTime: Number(e.avg_response_time) || 0,
  }));
  return { dailyStats, endpointStats };
}
