/**
 * Observability API Client — API 调用统计 RPC 请求层
 */
import { apiPost } from './client';

export const observabilityApi = {
  getDailyStats: (days: number) =>
    apiPost<unknown>('/api/data/rpc/get_api_daily_stats', { p_days: days }),
  getEndpointStats: (days: number) =>
    apiPost<unknown>('/api/data/rpc/get_api_endpoint_stats', { p_days: days }),
};
