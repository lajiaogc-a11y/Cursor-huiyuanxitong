/**
 * Risk API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost } from './client';

export const riskApi = {
  recordEvent: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/risk/events', data),
  resolveEvent: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/risk/events/resolve', data),
  getRecentEvents: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/risk/events${q}`);
  },
  recalculate: (data: Record<string, unknown>) =>
    apiPost<{ success?: boolean; score?: number }>('/api/risk/recalculate', data),
  getAllScores: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/risk/scores${q}`);
  },
  checkLoginAnomaly: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/risk/check-login-anomaly', data),
  checkFrequencyAnomaly: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/risk/check-frequency-anomaly', data),
};
