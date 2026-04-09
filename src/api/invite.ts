/**
 * Invite Ranking API Client — 纯 HTTP 请求层
 */
import { apiGet } from './client';

export const inviteApi = {
  getRankingTop5: () =>
    apiGet<unknown>('/api/invite/ranking'),
};
