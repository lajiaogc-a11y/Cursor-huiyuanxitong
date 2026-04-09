/**
 * Activity Rewards API Client — 活动累积奖励 RPC 请求层
 */
import { apiPost } from './client';

export const activityRewardsApi = {
  syncTiers: (tiers: Record<string, unknown>[]) =>
    apiPost<unknown>('/api/data/rpc/sync_activity_reward_tiers', { tiers }),
};
