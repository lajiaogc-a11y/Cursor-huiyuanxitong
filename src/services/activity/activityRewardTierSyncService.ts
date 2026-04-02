/**
 * 活动累积奖励档位同步到 activity_reward_tiers 表
 */
import { apiPost } from "@/api/client";

export type ActivityRewardTierSyncInput = {
  minPoints: number;
  maxPoints: number | null;
  rewardAmountNGN: number;
  rewardAmountGHS: number;
  rewardAmountUSDT: number;
};

export async function syncActivityRewardTiersToDatabase(tiers: ActivityRewardTierSyncInput[]): Promise<void> {
  await apiPost("/api/data/rpc/sync_activity_reward_tiers", {
    tiers: tiers.map((tier, index) => ({
      min_points: tier.minPoints,
      max_points: tier.maxPoints,
      reward_amount_ngn: tier.rewardAmountNGN,
      reward_amount_ghs: tier.rewardAmountGHS,
      reward_amount_usdt: tier.rewardAmountUSDT,
      sort_order: index,
    })),
  });
}
