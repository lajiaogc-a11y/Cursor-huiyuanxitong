/**
 * Member Portal Settings API Client — 纯 HTTP 请求层
 * 覆盖 /api/member-portal-settings/* 系列端点
 */
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

function q(params?: Record<string, string>): string {
  if (!params) return '';
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
}

export const memberPortalSettingsApi = {
  get: (params?: Record<string, string>) =>
    apiGet<unknown>(`/api/member-portal-settings${q(params)}`),
  upsert: (body: Record<string, unknown>) =>
    apiPut<unknown>('/api/member-portal-settings/', body),
  getByMember: (memberId: string) =>
    apiGet<unknown>(`/api/member-portal-settings/by-member/${encodeURIComponent(memberId)}`),
  getByInviteToken: (code: string) =>
    apiGet<unknown>(`/api/member-portal-settings/by-invite-token/${encodeURIComponent(code)}`),
  getByAccount: (value: string) =>
    apiGet<unknown>(`/api/member-portal-settings/by-account/${encodeURIComponent(value)}`),
  getDefault: () =>
    apiGet<unknown>('/api/member-portal-settings/default'),

  versions: {
    create: (body: Record<string, unknown>) =>
      apiPost<unknown>('/api/member-portal-settings/versions', body),
    list: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/versions${q(params)}`),
    rollback: (versionId: string, params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/versions/${encodeURIComponent(versionId)}/rollback${q(params)}`, {}),
    submitForApproval: (body: Record<string, unknown>) =>
      apiPost<unknown>('/api/member-portal-settings/versions/submit-approval', body),
    approve: (versionId: string, body: Record<string, unknown>) =>
      apiPost<unknown>(`/api/member-portal-settings/versions/${encodeURIComponent(versionId)}/approve`, body),
  },

  draft: {
    save: (body: Record<string, unknown>) =>
      apiPost<unknown>('/api/member-portal-settings/draft', body),
    get: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/draft${q(params)}`),
    publish: (body: Record<string, unknown>) =>
      apiPost<unknown>('/api/member-portal-settings/publish', body),
    discard: (params?: Record<string, string>) =>
      apiDelete<unknown>(`/api/member-portal-settings/draft${q(params)}`),
  },

  spinWheelPrizes: {
    list: () =>
      apiGet<unknown>('/api/member-portal-settings/spin-wheel-prizes'),
    upsert: (body: Record<string, unknown>) =>
      apiPost<unknown>('/api/member-portal-settings/spin-wheel-prizes', body),
    getByMember: (memberId: string) =>
      apiGet<unknown>(`/api/member-portal-settings/spin-wheel-prizes/by-member/${encodeURIComponent(memberId)}`),
  },

  checkIns: {
    list: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/check-ins${q(params)}`),
  },

  spinCreditsLog: {
    list: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/spin-credits-log${q(params)}`),
  },

  lotteryPointsLedger: {
    list: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/lottery-points-ledger${q(params)}`),
  },

  inviteLeaderboard: {
    getGrowthSettings: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/invite-leaderboard/growth-settings${q(params)}`),
    patchGrowthSettings: (body: unknown, params?: Record<string, string>) =>
      apiPatch<unknown>(`/api/member-portal-settings/invite-leaderboard/growth-settings${q(params)}`, body),
    listFakeUsers: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users${q(params)}`),
    patchFakeUser: (id: string, body: unknown, params?: Record<string, string>) =>
      apiPatch<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}${q(params)}`, body),
    toggleFakeUser: (id: string, body: unknown, params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}/toggle${q(params)}`, body),
    resetFakeUserGrowth: (id: string, params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users/${encodeURIComponent(id)}/reset-growth${q(params)}`, {}),
    seedFakeUsers: (body: unknown, params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/seed${q(params)}`, body),
    runGrowthNow: () =>
      apiPost<unknown>('/api/member-portal-settings/invite-leaderboard/run-growth-now', {}),
    deleteAllFakeUsers: (params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users/delete-all${q(params)}`, {}),
    resetCycle: (params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/reset-cycle${q(params)}`, {}),
    randomizeBase: (body: unknown, params?: Record<string, string>) =>
      apiPost<unknown>(`/api/member-portal-settings/invite-leaderboard/fake-users/randomize-base${q(params)}`, body),
  },

  siteData: {
    getStats: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal/site-data/stats${q(params)}`),
    getDataCleanup: (params?: Record<string, string>) =>
      apiGet<unknown>(`/api/member-portal/site-data/data-cleanup${q(params)}`),
    putDataCleanup: (body: Record<string, unknown>, params?: Record<string, string>) =>
      apiPut<unknown>(`/api/member-portal/site-data/data-cleanup${q(params)}`, body),
    previewDataCleanup: (params?: Record<string, string>) =>
      apiGet<{ count: number }>(`/api/member-portal/site-data/data-cleanup/preview${q(params)}`),
    runDataCleanup: (params?: Record<string, string>) =>
      apiPost<{ matched: number; purged: number }>(`/api/member-portal/site-data/data-cleanup/run${q(params)}`),
  },
};
