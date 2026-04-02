/**
 * 会员积分分类 Hook — 与 memberQueryKeys.pointsBreakdown 绑定
 */
import { useQuery } from '@tanstack/react-query';
import { getMemberPointsBreakdownRpc } from '@/services/memberPortal/memberPointsPortalService';
import { memberQueryKeys } from '@/lib/memberQueryKeys';

export interface PointsBreakdown {
  consumption_points: number;
  referral_points: number;
  lottery_points: number;
  total_points: number;
  frozen_points: number;
  /** 与员工活动数据「剩余积分」同源：points_accounts.balance */
  balance: number;
  pending_mall_points: number;
  referral_count: number;
}

const emptyBreakdown: PointsBreakdown = {
  consumption_points: 0,
  referral_points: 0,
  lottery_points: 0,
  total_points: 0,
  frozen_points: 0,
  balance: 0,
  pending_mall_points: 0,
  referral_count: 0,
};

export function useMemberPointsBreakdown(memberId: string | undefined) {
  const q = useQuery({
    queryKey: memberId ? memberQueryKeys.pointsBreakdown(memberId) : ['member', 'pointsBreakdown', '__none'],
    queryFn: async (): Promise<PointsBreakdown> => {
      const result = await getMemberPointsBreakdownRpc(memberId!);
      if (result.success) {
        const bal = Number(result.balance ?? result.total_points ?? 0);
        return {
          consumption_points: result.consumption_points ?? 0,
          referral_points: result.referral_points ?? 0,
          lottery_points: result.lottery_points ?? 0,
          total_points: Number(result.total_points ?? bal),
          frozen_points: Number(result.frozen_points ?? 0),
          balance: Number.isFinite(bal) ? bal : 0,
          pending_mall_points: Number(result.pending_mall_points ?? 0),
          referral_count: Math.max(0, Math.floor(Number(result.referral_count ?? 0))),
        };
      }
      // 抛出异常让 React Query 进入 isError 状态，而不是静默返回全零
      throw new Error(result.error || 'Failed to fetch points breakdown');
    },
    enabled: !!memberId,
    retry: 2,
  });

  return {
    breakdown: q.data ?? emptyBreakdown,
    loading: q.isLoading,
    error: q.isError,
    refresh: () => q.refetch(),
  };
}
