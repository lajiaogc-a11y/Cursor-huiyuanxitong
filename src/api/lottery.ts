/**
 * Lottery API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiGetAsStaff, apiPostAsStaff } from './client';
import type { DrawResult, LotteryLog, LotterySettings, OperationalStats } from '@/types/lottery';

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) { if (v !== undefined) sp.set(k, String(v)); }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const lotteryApi = {
  draw: (data: { member_id: string; request_id?: string }) =>
    apiPost<DrawResult>('/api/lottery/draw', data),
  getQuota: (memberId: string) =>
    apiGet<{ remaining: number; daily_free: number; credits: number; used_today: number }>(`/api/lottery/quota/${encodeURIComponent(memberId)}`),
  getMyLogs: (memberId: string, params?: Record<string, string | number | undefined>) =>
    apiGet<unknown>(`/api/lottery/logs/${encodeURIComponent(memberId)}${qs(params)}`),
  getMemberPrizes: (memberId: string, opts?: { cache?: string }) =>
    apiGet<unknown>(`/api/lottery/prizes/${encodeURIComponent(memberId)}`, opts?.cache ? { cache: opts.cache } as never : undefined),
  getSimFeed: () => apiGet<unknown>('/api/lottery/sim-feed'),

  admin: {
    listPrizes: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<unknown>(`/api/lottery/admin/prizes${q}`);
    },
    savePrizes: (data: unknown) => apiPostAsStaff<unknown>('/api/lottery/admin/prizes', data),
    listLogs: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<unknown>(`/api/lottery/admin/logs${q}`);
    },
    getSettings: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<LotterySettings>(`/api/lottery/admin/settings${q}`);
    },
    saveSettings: (data: unknown) => apiPostAsStaff<unknown>('/api/lottery/admin/settings', data),
    getSimFakeSettings: (params?: Record<string, string>) =>
      apiGetAsStaff<unknown>(`/api/lottery/admin/sim-fake-settings${qs(params)}`),
    saveSimFakeSettings: (data: unknown, params?: Record<string, string>) =>
      apiPostAsStaff<unknown>(`/api/lottery/admin/sim-fake-settings${qs(params)}`, data),
    getSimulationSettings: (params?: Record<string, string>) =>
      apiGetAsStaff<unknown>(`/api/lottery/admin/simulation-settings${qs(params)}`),
    saveSimulationSettings: (data: unknown, params?: Record<string, string>) =>
      apiPostAsStaff<unknown>(`/api/lottery/admin/simulation-settings${qs(params)}`, data),
    listSimulationFeed: (params?: Record<string, string | number | undefined>) =>
      apiGetAsStaff<unknown>(`/api/lottery/admin/simulation-feed${qs(params)}`),
    listSpinFakeHourRuns: (params?: Record<string, string | number | undefined>) =>
      apiGetAsStaff<unknown>(`/api/lottery/admin/simulation-hour-runs${qs(params)}`),
    startSpinFakeCron: (params?: Record<string, string>) =>
      apiPostAsStaff<unknown>(`/api/lottery/admin/simulation-cron-start${qs(params)}`, {}),
    getPendingRewards: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<unknown>(`/api/lottery/admin/pending-rewards${q}`);
    },
    retryFailedRewards: (data?: Record<string, unknown>) =>
      apiPostAsStaff<unknown>('/api/lottery/admin/retry-failed-rewards', data ?? {}),
    confirmReward: (data: Record<string, unknown>) =>
      apiPostAsStaff<unknown>('/api/lottery/admin/confirm-reward', data),
    manualRetryReward: (data: Record<string, unknown>) =>
      apiPostAsStaff<unknown>('/api/lottery/admin/manual-retry-reward', data),
    simulateCurrent: (params?: Record<string, string | number | undefined>) =>
      apiGetAsStaff<unknown>(`/api/lottery/admin/simulate${qs(params)}`),
    simulatePreview: (data: unknown) => apiPostAsStaff<unknown>('/api/lottery/admin/simulate-preview', data),
    getSnapshot: () => apiGetAsStaff<unknown>('/api/lottery/admin/snapshot'),
    reconcileAll: (data?: Record<string, unknown>) =>
      apiPostAsStaff<unknown>('/api/lottery/admin/reconcile-all', data ?? {}),
    runTask: (data: unknown) => apiPostAsStaff<unknown>('/api/lottery/admin/run-task', data),
    getTaskHistory: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<unknown>(`/api/lottery/admin/task-history${q}`);
    },
    setScheduler: (data?: unknown) => apiPostAsStaff<unknown>('/api/lottery/admin/scheduler', data ?? {}),
    getOperationalStats: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGetAsStaff<OperationalStats>(`/api/lottery/admin/operational-stats${q}`);
    },
  },
};
